import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class OpacSearchDto {
  @ApiPropertyOptional({ description: 'Recherche plein texte (titre, auteur, ISBN)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: ['tout', 'titre', 'categorie'],
    description:
      'Champ de recherche (à la PMB) : « titre » restreint aux titres, ' +
      '« categorie » filtre sur les catégories correspondantes. « auteur » est ' +
      'traité côté front (redirection vers l’index des auteurs). Défaut : tout.',
  })
  @IsOptional()
  @IsIn(['tout', 'titre', 'categorie', 'auteur'])
  dans?: string;

  @ApiPropertyOptional({ description: 'Facette catégorie (droit, medecine...)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Facette langue (fr, en...)' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Facette année de publication' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ description: 'Facette type de document (book...)' })
  @IsOptional()
  @IsString()
  recordType?: string;

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
