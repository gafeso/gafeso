import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { ClientIp } from '../audit/client-ip.decorator';
import { CatalogingService } from '../cataloging/cataloging.service';
import { AuthorsService } from './authors.service';
import {
  AuthorsListDto,
  AuthorSuggestDto,
  MergeAuthorDto,
  RattacherAuteurAuCompteDto,
  RenameAuthorDto,
} from './dto/authors-admin.dto';

/**
 * Gestion du fichier d'autorités (personnel `catalogue.gerer`) : autocomplétion,
 * renommage propagé, fusion de doublons, suppression si zéro œuvre. Tenant-scopé.
 * Les éditions qui touchent des notices déclenchent une réindexation ciblée.
 */
@ApiTags('authors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
@Controller('authors')
export class AuthorsAdminController {
  constructor(
    private readonly authors: AuthorsService,
    private readonly cataloging: CatalogingService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private tenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) throw new BadRequestException('Tenant non résolu.');
    return tenant;
  }

  @Get('suggest')
  @ApiOperation({ summary: 'Autocomplétion : auteurs existants par nom' })
  async suggest(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Query() query: AuthorSuggestDto,
  ) {
    const tenant = this.tenant(tenantOrNull);
    return this.authors.suggest(this.prisma.forTenant(tenant.slug), query.q);
  }

  @Get()
  @ApiOperation({ summary: 'Liste des fiches auteur (avec nombre d’œuvres)' })
  async list(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Query() query: AuthorsListDto,
  ) {
    const tenant = this.tenant(tenantOrNull);
    // ⚠ `limit` N'EST PLUS FORCÉ, MAIS SON DÉFAUT RESTE 200, ET C'EST
    // DÉLIBÉRÉ. La route rendait `total`/`page`/`totalPages` tout en REFUSANT
    // `page` : elle décrivait un parcours qu'elle n'offrait pas. Ouvrir les
    // deux paramètres était la correction.
    //
    // Laisser le défaut du service s'appliquer (50) aurait fait passer l'écran
    // des auteurs de 200 lignes à 50 pour un client qui ne demande rien — une
    // correction qui RETIRE à quelqu'un, sans que personne l'ait demandé. Le
    // front affiche aujourd'hui « 200 auteurs affichés sur 557 » et remplacera
    // cet avis par un vrai parcours quand il le voudra : d'ici là, rien ne
    // change pour lui.
    return this.authors.listAuthors(this.prisma.forTenant(tenant.slug), {
      q: query.q,
      page: query.page,
      limit: query.limit ?? 200,
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier une fiche auteur — nom (propagé partout + réindex), notice, dates',
    description:
      '⚠ `bio`, `birthYear` et `deathYear` étaient SERVIS par GET /authors/:id ' +
      'et écrits par aucune route : la fiche affichait trois cases vides à ' +
      'jamais. `null` EFFACE une valeur, un champ absent la laisse.',
  })
  async rename(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RenameAuthorDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.tenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const result = await this.authors.rename(db, id, dto.displayName, {
      bio: dto.bio,
      birthYear: dto.birthYear,
      deathYear: dto.deathYear,
    });
    await this.cataloging.reindexRecords(db, tenant.slug, result.affectedRecordIds);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.AUTHOR_RENAME,
      targetType: 'author',
      targetId: id,
      targetLabel: result.displayName,
      ip,
      metadata: { affected: result.affectedRecordIds.length },
    });
    return result;
  }

  @Post(':id/merge')
  @ApiOperation({ summary: 'Fusionner cette fiche dans une autre (contributions basculées)' })
  async merge(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: MergeAuthorDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.tenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const result = await this.authors.merge(db, id, dto.intoId);
    await this.cataloging.reindexRecords(db, tenant.slug, result.affectedRecordIds);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.AUTHOR_MERGE,
      targetType: 'author',
      targetId: dto.intoId,
      targetLabel: result.winnerName,
      ip,
      metadata: {
        mergedFrom: id,
        mergedName: result.loserName,
        affected: result.affectedRecordIds.length,
      },
    });
    return result;
  }

  @Patch(':id/compte')
  @ApiOperation({
    summary: 'Rattacher cette fiche à un compte — ou l’en détacher (`userId: null`)',
    description:
      'C’est ce lien qui rend « Mes encadrements » calculable : sans lui, un ' +
      'enseignant qui a dirigé quinze thèses lit « votre compte n’est relié à ' +
      'aucune fiche d’auteur ». Geste de bibliothécaire, jamais de ' +
      'l’intéressé : rattacher, c’est affirmer que cette personne signe bien ' +
      'ces œuvres, et l’écran qui en découle sert un dossier de promotion.',
  })
  async rattacherAuCompte(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RattacherAuteurAuCompteDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.tenant(tenantOrNull);
    const result = await this.authors.rattacherAuCompte(
      this.prisma.forTenant(tenant.slug),
      id,
      dto.userId,
    );
    // ⚠ TRACÉ. Le rattachement décide de qui pourra produire une pièce
    // justificative d'encadrement à son nom : c'est de la même famille qu'un
    // changement de rôle, pas une correction de fiche.
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.AUTHOR_ACCOUNT_LINK,
      targetType: 'author',
      targetId: id,
      targetLabel: result.displayName,
      ip,
      metadata: { userId: dto.userId },
    });
    return result;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une fiche auteur (uniquement si zéro œuvre)' })
  async remove(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.tenant(tenantOrNull);
    const result = await this.authors.remove(this.prisma.forTenant(tenant.slug), id);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.AUTHOR_DELETE,
      targetType: 'author',
      targetId: id,
      ip,
    });
    return result;
  }
}
