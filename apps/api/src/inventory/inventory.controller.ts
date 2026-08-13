import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { ClientIp } from '../audit/client-ip.decorator';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { InventoryService, TenantDb } from './inventory.service';
import { CreateSessionDto, ScanDto } from './dto/inventory.dto';

/**
 * Récolement / inventaire (vague 2). Réservé au personnel qui gère le
 * catalogue (statuts d'exemplaires). Tenant-scopé par le Host.
 */
@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
@ApiBearerAuth()
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  private db(tenant: ResolvedTenant | null): { db: TenantDb; tenant: ResolvedTenant } {
    if (!tenant) throw new BadRequestException('Établissement non résolu.');
    return { db: this.prisma.forTenant(tenant.slug), tenant };
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Créer une session de récolement' })
  async create(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSessionDto,
  ) {
    const { db } = this.db(tenant);
    return this.inventory.createSession(db, dto, user.email);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Lister les sessions de récolement' })
  async list(@CurrentTenant() tenant: ResolvedTenant | null) {
    const { db } = this.db(tenant);
    return this.inventory.listSessions(db);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Détail d’une session (avec progression)' })
  async detail(@CurrentTenant() tenant: ResolvedTenant | null, @Param('id') id: string) {
    const { db } = this.db(tenant);
    return this.inventory.getSession(db, id);
  }

  @Post('sessions/:id/scan')
  @ApiOperation({ summary: 'Scanner un exemplaire (douchette)' })
  async scan(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Body() dto: ScanDto,
  ) {
    const { db } = this.db(tenant);
    return this.inventory.scan(db, id, dto.barcode);
  }

  @Get('sessions/:id/report')
  @ApiOperation({ summary: 'Rapport de récolement (vus / manquants / inattendus / en prêt)' })
  async report(@CurrentTenant() tenant: ResolvedTenant | null, @Param('id') id: string) {
    const { db } = this.db(tenant);
    return this.inventory.report(db, id);
  }

  @Get('sessions/:id/report.csv')
  @ApiOperation({ summary: 'Export CSV du rapport de récolement' })
  async reportCsv(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { db } = this.db(tenant);
    const csv = await this.inventory.reportCsv(db, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="recolement-${id}.csv"`);
    res.end(csv);
  }

  @Post('sessions/:id/close')
  @ApiOperation({ summary: 'Clôturer une session' })
  async close(@CurrentTenant() tenant: ResolvedTenant | null, @Param('id') id: string) {
    const { db } = this.db(tenant);
    return this.inventory.closeSession(db, id);
  }

  @Post('sessions/:id/mark-missing')
  @ApiOperation({ summary: 'Marquer les manquants confirmés (statut MISSING, tracé)' })
  async markMissing(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @ClientIp() ip?: string,
  ) {
    const { db, tenant: t } = this.db(tenant);
    return this.inventory.markMissing(db, t, id, user, ip);
  }
}
