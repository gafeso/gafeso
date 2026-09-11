import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  MESSAGE_TRI_INVALIDE,
  SENS_PAR_DEFAUT,
  TRI_PAR_DEFAUT,
  TRIS_DISPONIBLES,
  TriDisponible,
} from '../tri-du-catalogue';

export class ListRecordsDto {
  @ApiPropertyOptional({
    description:
      'Recherche plein texte sur titre, complément de titre, auteur, ISBN et éditeur. ' +
      'Insensible à la casse. ⚠ SENSIBLE AUX ACCENTS : « medecine » ne trouve pas ' +
      '« Médecine » (limite de la base, voir listRecords).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    enum: TRIS_DISPONIBLES,
    default: TRI_PAR_DEFAUT,
    description:
      'Colonne de tri. ⚠ Le tri alphabétique (titre, auteur) n’est pas exposé : ' +
      'la base ne classe pas correctement les lettres accentuées — voir ' +
      'cataloging/tri-du-catalogue.ts.',
  })
  @IsOptional()
  @IsIn(TRIS_DISPONIBLES, { message: MESSAGE_TRI_INVALIDE })
  sort?: TriDisponible;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: SENS_PAR_DEFAUT })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Filtrer par catégorie (constellation)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
