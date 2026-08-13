import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { AuditService } from './audit.service';
import { AUDIT_ACTION_LABELS } from './audit.actions';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * Consultation du journal d'audit — LECTURE SEULE, réservée à
 * `etablissement.gerer`. Toujours borné au tenant courant : le service filtre
 * par `tenantId = tenant.id`, aucune fuite inter-école possible via cette route.
 */
@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.ETABLISSEMENT_GERER)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('actions')
  @ApiOperation({ summary: 'Libellés des actions journalisées (pour le filtre)' })
  actions() {
    return Object.entries(AUDIT_ACTION_LABELS).map(([code, label]) => ({ code, label }));
  }

  @Get()
  @ApiOperation({ summary: 'Journal d’audit paginé, filtrable (utilisateur, action, période)' })
  async list(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Query() query: AuditQueryDto,
  ) {
    if (!tenant) {
      throw new BadRequestException('Tenant non résolu.');
    }
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
      throw new BadRequestException('Dates de période invalides.');
    }
    return this.audit.list({
      tenantId: tenant.id,
      actor: query.actor,
      action: query.action,
      from,
      to,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }
}
