import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { EXPORT_DATASETS, ExportDataset, StatsService } from './stats.service';
import { StatsQueryDto } from './dto/stats-query.dto';
import { CSV_BOM } from './csv';

/**
 * Tableau de bord statistiques — réservé à `etablissement.gerer`, tenant-scopé.
 * Toutes les agrégations sont faites en base (groupBy / count / date_trunc),
 * jamais en chargeant les lignes en mémoire.
 */
@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FunctionsGuard)
@RequiresFunctions(FONCTIONS.ETABLISSEMENT_GERER)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  private tenant(tenant: ResolvedTenant | null): ResolvedTenant {
    if (!tenant) throw new BadRequestException('Tenant non résolu.');
    return tenant;
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Tableau de bord complet (KPIs, séries, palmarès, système)' })
  async dashboard(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Query() query: StatsQueryDto,
  ) {
    const tenant = this.tenant(tenantOrNull);
    return this.stats.dashboard(tenant.slug, tenant.id, query.toPeriod());
  }

  /** En-têtes CSV (UTF-8 + BOM) et écriture streamée. */
  private sendCsv(res: Response, filename: string, from: Date, csv: string) {
    const stamp = from.toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}-${stamp}.csv"`);
    res.write(CSV_BOM);
    res.write(csv);
    res.end();
  }

  @Get('export')
  @ApiOperation({ summary: 'Export CSV d’un tableau (UTF-8 + BOM, séparateur ;)' })
  async export(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Query('dataset') dataset: string,
    @Query() query: StatsQueryDto,
    @Res() res: Response,
  ) {
    const tenant = this.tenant(tenantOrNull);
    if (!EXPORT_DATASETS.includes(dataset as ExportDataset)) {
      throw new BadRequestException('Jeu de données inconnu.');
    }
    const period = query.toPeriod();
    const { filename, csv } = await this.stats.datasetCsv(
      tenant.slug,
      tenant.id,
      dataset as ExportDataset,
      period,
    );
    this.sendCsv(res, filename, period.from, csv);
  }

  @Get('report')
  @ApiOperation({ summary: 'Rapport d’activité complet (tous les indicateurs, un CSV)' })
  async report(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Query() query: StatsQueryDto,
    @Res() res: Response,
  ) {
    const tenant = this.tenant(tenantOrNull);
    const period = query.toPeriod();
    const csv = await this.stats.reportCsv(tenant.slug, tenant.id, period);
    this.sendCsv(res, 'rapport-activite', period.from, csv);
  }
}

