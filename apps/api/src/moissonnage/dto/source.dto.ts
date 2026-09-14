import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Les rythmes offerts. ⚠ TEXTE côté base : voir le schéma. */
export const PERIODICITES = ['manuelle', 'quotidienne', 'hebdomadaire'] as const;
export type Periodicite = (typeof PERIODICITES)[number];

export class CreateHarvestSourceDto {
  @ApiProperty({
    example: 'Dépôt institutionnel de l’Université d’Exemple',
    description: 'Un nom lisible : une URL n’est pas un nom dans une liste.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    example: 'https://depot.exemple.bf/oai',
    description:
      '⚠ Le serveur APPELLERA cette adresse. Les adresses internes (localhost, ' +
      '10.x, 192.168.x, 169.254.x, *.local) sont refusées : un entrepôt à ' +
      'moissonner est un service public.',
  })
  @IsString()
  baseUrl!: string;

  @ApiProperty({ example: 'oai_dc', description: '`oai_dc`, `marcxml`, `etdms`…' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  metadataPrefix!: string;

  @ApiPropertyOptional({
    example: 'com_123_456',
    description:
      'L’ensemble à moissonner. Absent = tout l’entrepôt — stocké en chaîne ' +
      'VIDE et non en NULL, pour que la contrainte d’unicité s’applique.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  setSpec?: string;

  @ApiPropertyOptional({ enum: PERIODICITES, default: 'manuelle' })
  @IsOptional()
  @IsIn(PERIODICITES)
  periodicity?: Periodicite;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * ⚠ `lastDatestamp` N'EST PAS MODIFIABLE PAR CETTE ROUTE, et c'est délibéré :
 * c'est un état du moteur, pas un réglage. L'ouvrir permettrait de faire
 * reculer le curseur à la main — donc de redemander à un entrepôt distant un
 * fonds entier par inadvertance.
 */
export class UpdateHarvestSourceDto extends PartialType(CreateHarvestSourceDto) {}

/**
 * ⚠ `page` EST ACCEPTÉ PARCE QUE LA RÉPONSE REND `totalPages`.
 *
 * L'invariant est posé dans ce dépôt depuis `/authors`, qui rendait `total`,
 * `page` et `totalPages` en REFUSANT le paramètre `page` : la réponse décrivait
 * un parcours que la route n'offrait pas, et le client de bonne foi tombait
 * dedans. Toute route qui rend `totalPages` accepte `page` — c'est un test, pas
 * une convention.
 */
export class PaginationMoissonnageDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
