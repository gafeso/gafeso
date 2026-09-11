import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { booleenDUrl } from './booleen-url';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Borne haute : la page d'accueil en demande six. Au-delà, c'est une autre page. */
export const MAX_NOUVEAUTES = 24;
export const NOUVEAUTES_PAR_DEFAUT = 6;

export class NouveautesDto {
  @ApiPropertyOptional({ default: NOUVEAUTES_PAR_DEFAUT, maximum: MAX_NOUVEAUTES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_NOUVEAUTES)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Ne rendre que les notices ayant un fichier numérique. Lu DANS LA BASE : ' +
      'ce filtre ne se combine pas avec la recherche plein texte.',
  })
  @IsOptional()
  @Transform(booleenDUrl)
  @IsBoolean()
  avecFichier?: boolean;
}
