import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** L'année civile du rapport. */
export class RapportAnnuelDto {
  /**
   * ⚠ BORNÉE, et pas seulement « un entier ». Une année hors de ces bornes est
   * une faute de frappe, jamais une intention — et un rapport produit sur
   * l'an 20 260 rendrait des zéros partout, c'est-à-dire un document faux et
   * plausible.
   */
  @ApiPropertyOptional({ description: 'Année civile. Par défaut : l’année écoulée.', example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'L’année doit être un nombre entier.' })
  @Min(2000, { message: 'Année trop ancienne : Gafeso n’a pas de données avant 2000.' })
  @Max(2100, { message: 'Année trop lointaine.' })
  annee?: number;

  /**
   * ⚠ LE DÉFAUT EST L'ANNÉE ÉCOULÉE, PAS L'ANNÉE EN COURS. Un rapport annuel
   * se produit en janvier POUR l'année qui vient de finir ; proposer l'année
   * courante rendrait un document partiel que rien ne signale comme tel.
   */
  anneeDemandee(maintenant: Date = new Date()): number {
    return this.annee ?? maintenant.getUTCFullYear() - 1;
  }
}
