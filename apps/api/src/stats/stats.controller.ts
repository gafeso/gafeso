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
import { annee } from './rapport-annuel';
import { RapportAnnuelService } from './rapport-annuel.service';
import { RapportAnnuelDto } from './dto/rapport-annuel.dto';
import { ModuleActifGuard } from '../modules/module-actif.guard';
import { ModuleRequis } from '../modules/module-requis.decorator';
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
@UseGuards(JwtAuthGuard, FunctionsGuard, ModuleActifGuard)
@RequiresFunctions(FONCTIONS.STATISTIQUES_VOIR)
// ⚠ SUR LA CLASSE : les trois routes l'héritent, et une quatrième écrite
// demain aussi. Le garde REFUSE en nommant le module — jamais un 200 appauvri
// ni une liste vide, qui se liraient « il n'y a rien » au lieu de « c'est
// éteint ».
@ModuleRequis('statistiques')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService,
    private readonly rapport: RapportAnnuelService,) {}

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

  @Get('rapport-annuel')
  @ApiOperation({
    summary: 'Le rapport annuel de l’établissement — ce qu’une directrice remet à son université',
    description:
      'Année civile complète. ⚠ Un bloc qu’on ne peut pas calculer est ABSENT ' +
      'et NOMMÉ, jamais rempli de zéros : ce document sert à décider d’un ' +
      'budget, et un zéro faux y coûte plus que partout ailleurs. Aucune ' +
      'donnée personnelle, et aucun groupe de moins de 5 — un effectif trop ' +
      'faible identifie des personnes sans les nommer.',
  })
  async rapportAnnuel(
    @CurrentTenant() tenantOrNull: ResolvedTenant | null,
    @Query() query: RapportAnnuelDto,
  ) {
    const tenant = this.tenant(tenantOrNull);
    return this.rapport.produire(tenant.slug, tenant.name ?? tenant.slug, annee(query.anneeDemandee()));
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

