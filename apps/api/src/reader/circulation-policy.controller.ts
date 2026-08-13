import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { ReaderService } from './reader.service';
import { UpdateCirculationPolicyDto } from './dto/update-circulation-policy.dto';

/**
 * Politique de circulation en ligne (renouvellement, mise de côté) — réservée à
 * `etablissement.gerer`, tenant-scopée. Distincte des règles de prêt du guichet
 * (par catégorie/type) : ici c'est la politique du self-service lecteur.
 */
@ApiTags('circulation-policy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.ETABLISSEMENT_GERER)
@Controller('circulation-policy')
export class CirculationPolicyController {
  constructor(
    private readonly reader: ReaderService,
    private readonly audit: AuditService,
  ) {}

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) throw new BadRequestException('Tenant non résolu.');
    return tenant;
  }

  @Get()
  @ApiOperation({ summary: 'Politique de circulation en ligne (défauts si non configurée)' })
  async get(@CurrentTenant() tenantOrNull: ResolvedTenant | null) {
    const tenant = this.requireTenant(tenantOrNull);
    return this.reader.getCirculationPolicy(tenant.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Modifier la politique de circulation en ligne' })
  async update(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCirculationPolicyDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const result = await this.reader.updateCirculationPolicy(tenant.id, dto);
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.CIRCULATION_POLICY_UPDATE,
      ip,
      metadata: {
        changed: Object.entries(dto)
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k),
      },
    });
    return result;
  }
}
