import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Déclenchement manuel des rappels. `asOf` = date de référence de test : permet
 * de « avancer la logique de date » sans manipuler l'horloge (ex. simuler un
 * prêt en retard). Absent → maintenant.
 */
export class RunRemindersDto {
  @ApiPropertyOptional({ description: 'Date de référence ISO 8601 (test). Défaut : maintenant.' })
  @IsOptional()
  @IsISO8601()
  asOf?: string;
}
