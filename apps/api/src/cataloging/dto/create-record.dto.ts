import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarcFormat } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CONTRIBUTOR_ROLES, ContributorRole } from '../contributor-roles';

export class ContributorDto {
  @ApiProperty({ example: 'Traoré, Awa' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom d’un contributeur ne peut pas être vide.' })
  name: string;

  @ApiProperty({ enum: CONTRIBUTOR_ROLES, example: 'AUTEUR_PRINCIPAL' })
  @IsIn(CONTRIBUTOR_ROLES, { message: 'Rôle de contributeur inconnu.' })
  role: ContributorRole;
}

export class CreateRecordDto {
  @ApiProperty({ example: 'Droit constitutionnel burkinabè' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: 'principes et jurisprudence',
    description:
      'Complément / sous-titre. Affiché « Titre : complément » — le séparateur ' +
      'relève de l’affichage, jamais stocké concaténé.',
  })
  @IsOptional()
  @IsString()
  titleComplement?: string;

  @ApiPropertyOptional({
    example: 'Traoré, Awa',
    description:
      'DÉPRÉCIÉ au profit de `contributors` — encore accepté (converti en ' +
      'AUTEUR_PRINCIPAL) pour la compatibilité des clients existants.',
  })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({
    type: [ContributorDto],
    description:
      'Contributeurs avec rôles (dans l’ordre d’affichage). Au moins un ' +
      'AUTEUR_PRINCIPAL est exigé à la création.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContributorDto)
  contributors?: ContributorDto[];

  @ApiPropertyOptional({ example: '978-2-1234-5678-9' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({ example: 2023 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(2100)
  publishYear?: number;

  @ApiPropertyOptional({ example: 'fr', default: 'fr' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'Éditions du Sahel' })
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional({
    example: 'Ouagadougou',
    description: 'Ville d’édition — SÉPARÉE de l’éditeur, jamais concaténée.',
  })
  @IsOptional()
  @IsString()
  publicationCity?: string;

  @ApiPropertyOptional({
    example: 'Université d’Exemple',
    description: 'Obligatoire pour une thèse ou un mémoire (validation serveur).',
  })
  @IsOptional()
  @IsString()
  defenseUniversity?: string;

  @ApiPropertyOptional({ example: 'Koudougou', description: 'Ville de soutenance (thèse/mémoire).' })
  @IsOptional()
  @IsString()
  defensePlace?: string;

  @ApiPropertyOptional({ description: 'Résumé / description (tous types).' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['foncier', 'droit rural', 'burkina faso'],
    description:
      'Mots-clés — minimum 3 à la création et à toute modification qui les ' +
      'fournit (règle non rétroactive : les fiches existantes restent lisibles).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({
    example: 'droit',
    description: 'Domaine de la constellation (droit, medecine, informatique...)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'book', default: 'book' })
  @IsOptional()
  @IsString()
  recordType?: string;

  @ApiPropertyOptional({ enum: MarcFormat, default: MarcFormat.UNIMARC })
  @IsOptional()
  @IsEnum(MarcFormat)
  marcFormat?: MarcFormat;

  @ApiPropertyOptional({ description: 'Notice MARC brute (JSON marcjs : leader + fields)' })
  @IsOptional()
  @IsObject()
  marcData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverUrl?: string;
}
