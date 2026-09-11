import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModuleActifGuard } from '../modules/module-actif.guard';
import { ModuleRequis } from '../modules/module-requis.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ModulesService } from '../modules/modules.service';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CirculationService, TenantDb } from './circulation.service';
import { HoldsService } from './holds.service';
import {
  CheckoutDto,
  CreateRuleDto,
  PlaceHoldDto,
  ReturnDto,
  UpdateRuleDto,
} from './dto/circulation.dto';

@ApiTags('circulation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.CIRCULATION_FAIRE)
@Controller('circulation')
export class CirculationController {
  constructor(
    private readonly circulation: CirculationService,
    private readonly holds: HoldsService,
    private readonly prisma: PrismaService,
    private readonly modules: ModulesService,
  ) {}

  /**
   * Heure d'échéance et fuseau de l'établissement (schéma `public`). Absents,
   * le service retombe sur ses défauts — l'emprunt ne doit jamais échouer
   * faute de réglage.
   */
  private async dueSettings(tenant: ResolvedTenant | null) {
    const t = this.requireTenant(tenant);
    const s = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: t.id },
      select: { loanDueTime: true, timezone: true },
    });
    // ⚠ SEUL ENDROIT où ce sac est construit — six appelants y passent. L'état
    // du module y entre donc une fois, et aucun chemin de circulation ne peut
    // l'oublier.
    const amendesActives = await this.modules.estActif(t.id, 'amendes');
    return { ...(s ?? {}), amendesActives };
  }

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) {
      throw new BadRequestException(
        'Tenant non résolu : domaine inconnu ou école non provisionnée.',
      );
    }
    return tenant;
  }

  private db(tenant: ResolvedTenant | null): TenantDb {
    return this.prisma.forTenant(this.requireTenant(tenant).slug);
  }

  // ── Prêts / retours ─────────────────────────────────────────
  @Post('checkout')
  @ApiOperation({
    summary: 'Enregistrer un prêt (codes-barres exemplaire + adhérent)',
    description:
      'Contrôles : disponibilité, carte non expirée, plafond de prêts de la ' +
      'catégorie. Un exemplaire mis de côté ne part qu’avec son réservataire.',
  })
  async checkout(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: CheckoutDto,
  ) {
    return this.circulation.checkout(
      this.db(tenant),
      dto,
      new Date(),
      await this.dueSettings(tenant),
    );
  }

  @Post('return')
  @ApiOperation({
    summary: 'Enregistrer un retour',
    description:
      'Calcule l’amende de retard (FCFA) selon la règle applicable et met ' +
      'l’exemplaire de côté si une réservation est en attente.',
  })
  async returnItem(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Body() dto: ReturnDto,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const db = this.db(tenant);
    const result = await this.circulation.returnItem(
      db,
      dto.itemBarcode,
      new Date(),
      undefined,
      await this.dueSettings(tenant),
    );
    // Si le retour a mis un exemplaire de côté pour une réservation, prévenir le
    // premier de la file (email idempotent via holds.notifiedAt).
    if (result.holdReady) {
      await this.holds.notifyAvailable(db, tenant.id);
    }
    return result;
  }

  @Post('checkouts/:id/renew')
  @ApiOperation({
    summary: 'Renouveler un prêt',
    description:
      'Refusé si plafond de renouvellements atteint, prêt en retard, ou ' +
      'réservation active sur la notice.',
  })
  async renew(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.circulation.renew(
      this.db(tenant),
      id,
      new Date(),
      await this.dueSettings(tenant),
    );
  }

  @Get('overdues')
  @ApiOperation({ summary: 'Registre des retards (amende courue en FCFA)' })
  async overdues(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.circulation.listOverdues(this.db(tenant), new Date(), await this.dueSettings(tenant));
  }

  @Get('patrons/:id')
  @ApiOperation({
    summary: 'Situation d’un adhérent (prêts, réservations, amendes FCFA)',
  })
  async patronSituation(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.circulation.patronSituation(
      this.db(tenant),
      id,
      new Date(),
      await this.dueSettings(tenant),
    );
  }

  // ── Réservations ────────────────────────────────────────────
  @Get('holds')
  @ApiOperation({
    summary: 'File d’attente des réservations (vue guichet)',
    description: 'Réservations actives par notice, dans l’ordre, avec l’adhérent.',
  })
  async listHolds(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.circulation.listActiveHolds(this.db(tenant));
  }

  @Post('holds')
  @ApiOperation({
    summary: 'Poser une réservation',
    description:
      'Si un exemplaire est libre il est mis de côté (retrait sous 7 jours), ' +
      'sinon l’adhérent entre dans la file d’attente.',
  })
  async placeHold(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: PlaceHoldDto,
  ) {
    return this.circulation.placeHold(this.db(tenant), dto);
  }

  @Post('holds/:id/cancel')
  @ApiOperation({
    summary: 'Annuler une réservation',
    description:
      'Si un exemplaire était mis de côté, il passe au réservataire suivant ou redevient disponible.',
  })
  async cancelHold(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.circulation.cancelHold(this.db(tenant), id);
  }

  // ── Règles ──────────────────────────────────────────────────
  @Post('rules')
  @UseGuards(ModuleActifGuard)
  @ModuleRequis('amendes')
  @ApiOperation({
    summary: 'Créer une règle de circulation',
    description:
      'Par catégorie d’adhérent et type d’exemplaire (« * » = tous). ' +
      'Amende par jour de retard en FCFA.',
  })
  async createRule(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Body() dto: CreateRuleDto,
  ) {
    return this.circulation.createRule(this.db(tenant), dto);
  }

  @Get('rules')
  @UseGuards(ModuleActifGuard)
  @ModuleRequis('amendes')
  @ApiOperation({ summary: 'Lister les règles de circulation' })
  async listRules(@CurrentTenant() tenant: ResolvedTenant | null) {
    return this.circulation.listRules(this.db(tenant));
  }

  @Patch('rules/:id')
  @UseGuards(ModuleActifGuard)
  @ModuleRequis('amendes')
  @ApiOperation({ summary: 'Modifier une règle de circulation' })
  async updateRule(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.circulation.updateRule(this.db(tenant), id, dto);
  }

  @Delete('rules/:id')
  @UseGuards(ModuleActifGuard)
  @ModuleRequis('amendes')
  @ApiOperation({ summary: 'Supprimer une règle de circulation' })
  async deleteRule(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
  ) {
    return this.circulation.deleteRule(this.db(tenant), id);
  }
}
