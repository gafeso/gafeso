import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { booleenDUrl } from './booleen-url';

export const MAX_PARCOURIR = 100;
export const PARCOURIR_PAR_DEFAUT = 20;

export class ParcourirDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: PARCOURIR_PAR_DEFAUT, maximum: MAX_PARCOURIR })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PARCOURIR)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Ne rendre que les notices ayant un fichier numérique. Lu DANS LA BASE : ' +
      'ce filtre ne passe pas par le moteur de recherche.',
  })
  @IsOptional()
  @Transform(booleenDUrl)
  @IsBoolean()
  avecFichier?: boolean;
}
