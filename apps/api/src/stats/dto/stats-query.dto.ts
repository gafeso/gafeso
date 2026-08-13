import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { GRANULARITIES, Granularity, StatsPeriod } from '../stats-period';

const DAY_MS = 24 * 3600 * 1000;

/** Fenêtre temporelle du tableau de bord. Défaut : 30 derniers jours, par jour. */
export class StatsQueryDto {
  @ApiPropertyOptional({ description: 'Jeu de données à exporter (endpoint /stats/export).' })
  @IsOptional()
  @IsString()
  dataset?: string;

  @ApiPropertyOptional({ description: 'Début de période (ISO). Défaut : il y a 30 jours.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Fin de période EXCLUE (ISO). Défaut : maintenant.' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: GRANULARITIES, description: 'Granularité des séries. Défaut : day.' })
  @IsOptional()
  @IsIn(GRANULARITIES)
  granularity?: Granularity;

  /** Résout la période (bornes valides, from < to), avec des défauts sûrs. */
  toPeriod(now: Date = new Date()): StatsPeriod {
    const to = this.to ? new Date(this.to) : now;
    const from = this.from ? new Date(this.from) : new Date(to.getTime() - 30 * DAY_MS);
    const granularity: Granularity = this.granularity ?? 'day';
    // Bornes invalides ou inversées → repli sur les 30 derniers jours.
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
      return { from: new Date(now.getTime() - 30 * DAY_MS), to: now, granularity };
    }
    return { from, to, granularity };
  }
}
