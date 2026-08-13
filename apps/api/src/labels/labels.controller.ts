import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FunctionsGuard } from '../auth/functions.guard';
import { RequiresFunctions } from '../auth/functions.decorator';
import { FONCTIONS } from '../auth/functions';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import { ResolvedTenant } from '../tenancy/tenancy.service';
import { LabelsService, LabelCriteria } from './labels.service';
import { LabelLayout } from './label-pdf';

/** Découpe une liste CSV de query en tableau nettoyé (ou undefined si vide). */
function splitIds(value?: string): string[] | undefined {
  if (!value) return undefined;
  const list = value.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

/** Entier borné (grille, départ) — repli sur `def` si absent/invalide. */
function intInRange(value: string | undefined, def: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

@ApiTags('cataloging')
@Controller('cataloging')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  /**
   * PDF de planche d'étiquettes code-barres (Code 128) prêt à imprimer.
   * Sélection : exemplaires précis (itemIds), notices entières (recordIds),
   * ou filtre (location / nouveaute). Grille paramétrable (columns × rows) +
   * départ décalé (start) pour finir une planche entamée. Réservé au personnel.
   */
  @Get('labels')
  @UseGuards(JwtAuthGuard, FunctionsGuard)
  @RequiresFunctions(FONCTIONS.CATALOGUE_GERER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Générer une planche PDF d’étiquettes code-barres' })
  async labelsPdf(
    @CurrentTenant() tenant: ResolvedTenant | null,
    @Res() res: Response,
    @Query('itemIds') itemIds?: string,
    @Query('recordIds') recordIds?: string,
    @Query('location') location?: string,
    @Query('nouveaute') nouveaute?: string,
    @Query('columns') columns?: string,
    @Query('rows') rows?: string,
    @Query('start') start?: string,
  ): Promise<void> {
    if (!tenant) throw new BadRequestException('Établissement non résolu.');

    const criteria: LabelCriteria = {
      itemIds: splitIds(itemIds),
      recordIds: splitIds(recordIds),
      location: location?.trim() || undefined,
      nouveaute: nouveaute === '1' || nouveaute === 'true',
    };
    const layout: Partial<LabelLayout> = {
      columns: intInRange(columns, 3, 1, 8),
      rows: intInRange(rows, 8, 1, 12),
      start: intInRange(start, 1, 1, 96),
    };

    const bytes = await this.labels.generatePdf(tenant, criteria, layout);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="etiquettes.pdf"');
    res.end(Buffer.from(bytes));
  }
}
