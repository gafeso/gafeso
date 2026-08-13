import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Politique de circulation en ligne, éditable par l'établissement (PATCH partiel). */
export class UpdateCirculationPolicyDto {
  @ApiPropertyOptional({ description: 'Autoriser le renouvellement en ligne.' })
  @IsOptional()
  @IsBoolean()
  onlineRenewalEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Plafond de renouvellements en ligne par prêt (0 à 10).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  onlineRenewalMax?: number;

  @ApiPropertyOptional({ description: 'Durée d’un renouvellement en jours (1 à 90).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  onlineRenewalDays?: number;

  @ApiPropertyOptional({ description: 'Refuser le renouvellement si le prêt est en retard.' })
  @IsOptional()
  @IsBoolean()
  onlineRenewalRefuseOverdue?: boolean;

  @ApiPropertyOptional({ description: 'Durée de mise de côté d’une réservation disponible (1 à 30 jours).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  holdPickupDays?: number;
}
