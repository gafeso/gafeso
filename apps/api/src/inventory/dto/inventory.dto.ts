import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const INVENTORY_SCOPES = ['ALL', 'LOCATION'] as const;

export class CreateSessionDto {
  @ApiProperty({ example: 'Récolement Documentation — juillet' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la session est requis.' })
  name: string;

  @ApiProperty({ enum: INVENTORY_SCOPES, example: 'LOCATION' })
  @IsIn(INVENTORY_SCOPES, { message: 'Périmètre invalide (ALL ou LOCATION).' })
  scope: (typeof INVENTORY_SCOPES)[number];

  @ApiPropertyOptional({ example: 'Documentation', description: 'Requis si scope = LOCATION.' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class ScanDto {
  @ApiProperty({ example: 'BIB-000123' })
  @IsString()
  @IsNotEmpty({ message: 'Code-barres vide.' })
  barcode: string;
}

/**
 * Le PARCOURS d'une catégorie du rapport.
 *
 * ⚠ La catégorie n'est PAS ici : elle est dans le chemin. Ce n'est pas un
 * filtre optionnel, c'est QUELLE liste on demande — une route sans elle n'a
 * pas de sens, et un défaut arbitraire (« missing », pourquoi ?) serait un
 * contrat implicite de plus.
 *
 * ⚠ Les bornes sont ici, pas dans le service : un `limit` non borné rendrait
 * la pagination décorative — il suffirait de demander `limit=100000` pour
 * retrouver les deux mégaoctets qu'on vient d'éviter.
 */
export class PaginationRecolementDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La page doit être un entier.' })
  @Min(1, { message: 'La page commence à 1.' })
  page?: number;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 500, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La taille de page doit être un entier.' })
  @Min(1, { message: 'La taille de page commence à 1.' })
  @Max(500, { message: 'La taille de page est bornée à 500.' })
  limit?: number;
}
