import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
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
import { RemindersService } from './reminders.service';
import { RunRemindersDto } from './dto/run-reminders.dto';
import { UpdateReminderSettingsDto } from './dto/update-reminder-settings.dto';
import { PreviewReminderDto } from './dto/preview-reminder.dto';
import { ReminderLogQueryDto } from './dto/reminder-log-query.dto';

/**
 * Rappels de circulation — endpoints réservés à `etablissement.gerer`, toujours
 * bornés au tenant courant (résolu depuis le Host).
 */
@ApiTags('reminders')
@Controller('reminders')
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.CIRCULATION_RETARDS)
@ApiBearerAuth()
export class RemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly audit: AuditService,
  ) {}

  private requireTenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) throw new BadRequestException('Tenant non résolu.');
    return tenant;
  }

  @Get('settings')
  @ApiOperation({ summary: 'Paramètres de rappels + modèles (défauts si non personnalisés)' })
  async getSettings(@CurrentTenant() tenantOrNull: ResolvedTenant | null) {
    const tenant = this.requireTenant(tenantOrNull);
    return this.reminders.getSettings(tenant.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Modifier les paramètres et modèles de rappels' })
  async updateSettings(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateReminderSettingsDto,
    @ClientIp() ip?: string,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const result = await this.reminders.updateSettings(tenant.id, dto);
    // Trace de configuration : on journalise QUELS réglages ont été touchés
    // (jamais le contenu intégral des modèles).
    void this.audit.log({
      tenantId: tenant.id,
      actorId: user.sub,
      actorEmail: user.email,
      actorRole: user.role,
      action: AUDIT_ACTIONS.REMINDER_CONFIG_UPDATE,
      ip,
      metadata: {
        // Uniquement les champs réellement fournis (le ValidationPipe matérialise
        // les optionnels absents à `undefined` — on les écarte).
        changed: Object.entries(dto)
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k),
        enabled: result.enabled,
        daysBefore: result.daysBefore,
        overdueRepeatDays: result.overdueRepeatDays,
      },
    });
    return result;
  }

  @Get('log')
  @ApiOperation({ summary: 'Journal des rappels envoyés (destinataire, prêt, type, statut, date)' })
  async log(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Query() query: ReminderLogQueryDto,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    return this.reminders.listLog(tenant.id, {
      type: query.type,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('preview')
  @ApiOperation({ summary: 'Aperçu d’un modèle (rendu avec des données d’exemple)' })
  preview(@Body() dto: PreviewReminderDto) {
    return this.reminders.preview(dto.type, dto.subject, dto.body);
  }

  @Post('run')
  @ApiOperation({
    summary: 'Déclencher les rappels de circulation maintenant',
    description:
      'Action explicite (indépendante de la bascule automatique) : traite les ' +
      'prêts du tenant courant. `asOf` permet de tester avec une date de ' +
      'référence. Idempotent : relancer n’envoie aucun doublon.',
  })
  async run(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Body() dto: RunRemindersDto,
  ) {
    const tenant = this.requireTenant(tenantOrNull);
    const asOf = dto.asOf ? new Date(dto.asOf) : new Date();
    if (isNaN(asOf.getTime())) throw new BadRequestException('Date de référence invalide.');
    return this.reminders.runForTenant(tenant.id, tenant.slug, asOf);
  }
}
