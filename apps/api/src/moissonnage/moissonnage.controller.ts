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
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { ClientIp } from '../audit/client-ip.decorator';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { MoissonnageService } from './moissonnage.service';
import {
  CreateHarvestSourceDto,
  PaginationMoissonnageDto,
  UpdateHarvestSourceDto,
} from './dto/source.dto';

/**
 * LE MOISSONNAGE — l'ENTRÉE, quand `interoperabilite` gouverne la sortie
 * (arbitrage 5 du brief P7).
 *
 * ⚠ SOUS `outils.catalogue`, ET C'EST UN CHOIX MESURÉ, PAS UNE COMMODITÉ.
 * C'est déjà la fonction de `POST /cataloging/records/import-marc` : même
 * NATURE — une ingestion en masse de notices venues d'ailleurs —, même
 * titulaire (Bibliothécaire, Administrateur), aucune fonction nouvelle donc
 * aucun élargissement de droits.
 *
 * ⚠ ET LES ROUTES QUI PRENNENT UN IDENTIFIANT DE SOURCE VIVENT SOUS LA MÊME
 * FONCTION QUE CELLE QUI LES LISTE. Sinon l'un des deux serait inutile à qui
 * détient l'autre — voir sans pouvoir agir, ou pouvoir agir sans savoir sur
 * quoi. C'est le défaut payé sur la réattribution d'un dépôt.
 *
 * ⚠ PAS DE `@ModuleRequis('moissonnage')` POUR L'INSTANT, et c'est délibéré :
 * un module activable doit déclarer au moins un écran qui EXISTE dans
 * `apps/web` (`ecrans-declares.spec.ts` le vérifie). L'écran est P7-4. Le
 * déclarer maintenant obligerait à promettre un écran imaginaire — la faute
 * exacte que ce garde a été écrit pour empêcher. À reprendre avec P7-4.
 */
@ApiTags('moissonnage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.OUTILS_CATALOGUE)
@Controller('moissonnage')
export class MoissonnageController {
  constructor(
    private readonly moissonnage: MoissonnageService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private ctx(tenant: ResolvedTenant | null): {
    db: PrismaClient;
    slug: string;
    tenant: ResolvedTenant;
  } {
    if (!tenant) throw new BadRequestException('Tenant non résolu.');
    return { db: this.prisma.forTenant(tenant.slug), slug: tenant.slug, tenant };
  }

  @Get('sources')
  @ApiOperation({
    summary: 'Les entrepôts déclarés, avec leur DERNIÈRE exécution',
    description:
      'La dernière exécution est JOINTE, jamais recopiée sur la source : une ' +
      'seconde vérité serait à tenir d’accord avec la première.',
  })
  listerSources(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.moissonnage.listerSources(this.ctx(tenant).db);
  }

  @Post('sources')
  @ApiOperation({
    summary: 'Déclarer un entrepôt à moissonner',
    description:
      '⚠ Le serveur APPELLERA cette adresse : les adresses internes ' +
      '(localhost, 10.x, 192.168.x, 169.254.x, *.local) sont refusées, et le ' +
      'refus DIT laquelle et pourquoi. L’URL est normalisée avant d’entrer ' +
      'dans la contrainte d’unicité — sinon deux écritures de la même adresse ' +
      'feraient deux sources pour un seul entrepôt.',
  })
  async creerSource(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateHarvestSourceDto,
    @ClientIp() ip?: string,
  ) {
    const { db, tenant } = this.ctx(tenantOrNull);
    const source = await this.moissonnage.creerSource(db, dto);
    // ⚠ TRACÉ : déclarer une source, c'est décider que le serveur appellera une
    // adresse extérieure de façon récurrente. C'est de la même famille qu'un
    // changement de réglage, pas d'une saisie de notice.
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.HARVEST_SOURCE_CREATE,
      targetType: 'harvest_source',
      targetId: source.id,
      targetLabel: source.name,
      ip,
      metadata: { baseUrl: source.baseUrl, metadataPrefix: source.metadataPrefix },
    });
    return source;
  }

  @Patch('sources/:id')
  @ApiOperation({
    summary: 'Modifier un entrepôt déclaré',
    description:
      '⚠ `lastDatestamp` n’est PAS modifiable : c’est un état du moteur, pas ' +
      'un réglage. L’ouvrir permettrait de faire reculer le curseur à la main, ' +
      'donc de redemander un fonds entier à un entrepôt distant par inadvertance.',
  })
  modifierSource(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateHarvestSourceDto,
  ) {
    return this.moissonnage.modifierSource(this.ctx(tenant).db, id, dto);
  }

  @Delete('sources/:id')
  @ApiOperation({
    summary: 'Retirer un entrepôt déclaré — les notices moissonnées RESTENT',
    description:
      'La mémoire du moissonnage part (exécutions, identités) ; les notices ' +
      'sont des notices du catalogue comme les autres. La réponse COMPTE ' +
      'celles qui restent : « supprimée » sans le dire laisserait croire ' +
      'qu’elles sont parties avec.',
  })
  async supprimerSource(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    const { db, tenant } = this.ctx(tenantOrNull);
    const resultat = await this.moissonnage.supprimerSource(db, id);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.HARVEST_SOURCE_DELETE,
      targetType: 'harvest_source',
      targetId: id,
      targetLabel: resultat.supprimee,
      ip,
      metadata: resultat,
    });
    return resultat;
  }

  @Post('sources/:id/executer')
  @ApiOperation({
    summary: 'Moissonner maintenant',
    description:
      'Rend le compte rendu écrit en base. ⚠ Les quatre issues ne se ' +
      'confondent pas : `moisson`, `vide` (confirmé par l’entrepôt), ' +
      '`injoignable`, `erreur_protocole`. Une source injoignable n’est jamais ' +
      'rendue comme « zéro notice ».',
  })
  async executer(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
  ) {
    const { db, slug, tenant } = this.ctx(tenantOrNull);
    const run = await this.moissonnage.executer(db, slug, id);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.HARVEST_RUN,
      targetType: 'harvest_source',
      targetId: id,
      ip,
      metadata: { outcome: run.outcome, created: run.created, collided: run.collided },
    });
    return run;
  }

  @Get('sources/:id/executions')
  @ApiOperation({ summary: 'Les comptes rendus d’une source, du plus récent au plus ancien' })
  executions(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Query() query: PaginationMoissonnageDto,
  ) {
    return this.moissonnage.executions(this.ctx(tenant).db, id, query.page, query.limit);
  }

  @Get('sources/:id/collisions')
  @ApiOperation({
    summary: 'Les notices signalées et non tranchées',
    description:
      'Décision 2 du brief : le moissonnage SIGNALE, il ne tranche pas. Rien ' +
      'n’a été écrasé — ces lignes attendent un arbitrage humain.',
  })
  collisions(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Query() query: PaginationMoissonnageDto,
  ) {
    return this.moissonnage.collisions(this.ctx(tenant).db, id, query.page, query.limit);
  }
}
