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
    return this.authors.listAuthors(this.prisma.forTenant(tenant.slug), { q: query.q, limit: 200 });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renommer une fiche auteur (propagé partout + réindex)' })
  async rename(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RenameAuthorDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.tenant(tenantOrNull);
    const db = this.prisma.forTenant(tenant.slug);
    const result = await this.authors.rename(db, id, dto.displayName);
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
