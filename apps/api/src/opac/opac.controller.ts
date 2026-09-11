import { BadRequestException, Controller, Get, Header, Headers, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tokenFromCookieHeader } from '../auth/session-cookie';
import { AuthzService } from '../auth/authz.service';
import { FONCTIONS } from '../auth/functions';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthorsService } from '../authors/authors.service';
import { CHIFFRES_TTL_SECONDS, OpacService } from './opac.service';
import { NouveautesDto } from './dto/nouveautes.dto';
import { ParcourirDto } from './dto/parcourir.dto';
import { OpacSearchDto } from './dto/opac-search.dto';
import { AuthorsIndexDto } from './dto/authors-index.dto';

/**
 * OPAC public : la recherche, la constellation et les fiches sont accessibles
 * sans compte. Les données réservées aux membres (exemplaires, disponibilité)
 * ne sont renvoyées qu'avec un JWT valide — le masquage est fait côté API,
 * l'interface n'est qu'une commodité.
 */
@ApiTags('opac')
@Controller('opac')
export class OpacController {
  constructor(
    private readonly opac: OpacService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly accessControl: AccessControlService,
    private readonly authz: AuthzService,
    private readonly authors: AuthorsService,
  ) {}

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return tenant;
  }

  /**
   * Vrai si la requête porte un JWT valide ÉMIS POUR CETTE ÉCOLE
   * (authentification OPTIONNELLE — un jeton d'une autre école = anonyme).
   * Lit le jeton du cookie httpOnly `bc_token` (canal du navigateur depuis le
   * passage au cookie httpOnly) OU de l'en-tête `Authorization: Bearer`
   * (clients hors navigateur). Sans le cookie, un utilisateur connecté était vu
   * comme anonyme → fiche verrouillée à tort (régression prod 2026-07-16).
   */
  private isMember(tenantSlug: string, authorization?: string, cookie?: string): boolean {
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const token = bearer ?? tokenFromCookieHeader(cookie);
    if (!token) return false;
    try {
      const payload = this.jwt.verify(token) as { tenant?: string };
      return payload.tenant === tenantSlug;
    } catch {
      return false;
    }
  }

  @Get('search')
  @ApiOperation({
    summary: 'Recherche dans le catalogue (public, plein texte + facettes)',
  })
  async search(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: OpacSearchDto,
  ) {
    return this.opac.searchCatalog(this.requireTenant(tenant).slug, query);
  }

  /**
   * Chiffres publics du fonds — quatre entiers, aucune donnée nominative.
   *
   * `Cache-Control` annonce la fraîcheur RÉELLE : les comptages sont mis en
   * cache côté serveur pour la même durée. C'est l'en-tête qui porte cette
   * information, et non le corps, parce que le contrat convenu avec la page
   * d'accueil est « quatre entiers, rien d'autre » — y ajouter un horodatage
   * casserait le contrat pour dire ce que HTTP sait déjà exprimer.
   */
  @Get('chiffres')
  @Header('Cache-Control', `public, max-age=${CHIFFRES_TTL_SECONDS}`)
  @ApiOperation({
    summary: 'Chiffres du fonds (public) — documents, lecteurs, numérique, hors ligne',
  })
  async chiffres(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.opac.chiffresDuFonds(this.requireTenant(tenant).slug);
  }

  /**
   * Notices les plus récemment AJOUTÉES au catalogue (public).
   *
   * ⚠ Le titre de section côté page est « À découvrir dans le catalogue », et
   * non « Dernières acquisitions » : l'ordre reflète l'écriture des lignes en
   * base, pas une date d'acquisition — qui n'existe pas dans le modèle.
   */
  @Get('nouveautes')
  @Header('Cache-Control', `public, max-age=${CHIFFRES_TTL_SECONDS}`)
  @ApiOperation({
    summary: 'Notices récemment ajoutées au catalogue (public, ordre stable)',
  })
  async nouveautes(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: NouveautesDto,
  ) {
    return this.opac.nouveautes(
      this.requireTenant(tenant).slug,
      query.limit,
      query.avecFichier,
    );
  }

  /**
   * Parcours du catalogue (public, servi par la base) — paginé, total juste.
   * Porte le filtre « a un fichier », que la recherche plein texte ne peut pas
   * offrir sans que ses totaux deviennent faux.
   */
  @Get('parcourir')
  @Header('Cache-Control', `public, max-age=${CHIFFRES_TTL_SECONDS}`)
  @ApiOperation({ summary: 'Parcourir le catalogue (public, paginé)' })
  async parcourir(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: ParcourirDto,
  ) {
    return this.opac.parcourir(
      this.requireTenant(tenant).slug,
      query.page,
      query.limit,
      query.avecFichier,
    );
  }

  @Get('constellation')
  @Header('Cache-Control', `public, max-age=${CHIFFRES_TTL_SECONDS}`)
  @ApiOperation({
    summary: 'Répartition du catalogue par catégorie (public, page constellation)',
  })
  async constellation(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.opac.constellation(this.requireTenant(tenant).slug);
  }

  @Get('authors')
  @ApiOperation({
    summary: 'Index des auteurs (public) — liste alphabétique + nombre d’œuvres',
  })
  async authorsIndex(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: AuthorsIndexDto,
  ) {
    const resolved = this.requireTenant(tenant);
    return this.authors.listAuthors(this.prisma.forTenant(resolved.slug), {
      q: query.q,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('authors/:id')
  @ApiOperation({
    summary: 'Fiche auteur (public) — infos + œuvres groupées par rôle',
  })
  async authorDetail(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    const resolved = this.requireTenant(tenant);
    return this.authors.getAuthor(this.prisma.forTenant(resolved.slug), id);
  }

  @Get('records/:id')
  @ApiOperation({
    summary: 'Fiche détaillée d’une notice (public)',
    description:
      'Exemplaires et disponibilité réservés aux membres : sans JWT valide, ' +
      'la réponse porte membersOnly=true et masque ces champs.',
  })
  async record(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('cookie') cookie?: string,
  ) {
    const resolved = this.requireTenant(tenant);
    return this.opac.recordDetail(
      this.prisma.forTenant(resolved.slug),
      id,
      this.isMember(resolved.slug, authorization, cookie),
    );
  }

  @Get('records/:id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'URL de lecture en ligne du fichier numérique (membres autorisés uniquement)',
    description:
      'Étudiants : réservé à ceux dont la classe/l’abonnement donne accès à ce ' +
      'document (module access-control, brique 4) — 403 sinon, vérifié côté ' +
      'serveur, jamais seulement côté front. Personnel (bibliothécaire, ' +
      'gestionnaire, admin) : lecture sans restriction ; le téléchargement ' +
      'reste réservé à l’admin. URL signée valable 2 h.',
  })
  async read(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const resolved = this.requireTenant(tenant);
    const db = this.prisma.forTenant(resolved.slug);
    // Fonction document.lire (personnel) : lecture libre (ctx null).
    // Sinon : contexte classe/abonnement soumis à access-control.
    const readsAll = await this.authz.hasFunction(db, user.sub, FONCTIONS.DOCUMENT_LIRE);
    const ctx = readsAll
      ? null
      : await this.accessControl.buildStudentContext(resolved, db, user.sub);
    return this.opac.getReadUrl(db, id, ctx);
  }
}
