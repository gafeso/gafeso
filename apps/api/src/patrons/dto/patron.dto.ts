import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CarteIdentifiable } from './carte-identifiable.validator';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';

export class CreatePatronDto {
  @ApiProperty({ example: 'P-2026-0001', description: 'Code-barres de la carte' })
  @IsString()
  @IsNotEmpty()
  // ⚠ LA CONTRAINTE « UN NOM OU UN COMPTE » EST PORTÉE ICI, sur un champ
  // TOUJOURS REQUIS, et ce n'est pas un caprice de placement : posée sur
  // `firstName`, qui est `@IsOptional()`, elle ne se déclenchait JAMAIS dans le
  // cas anonyme — class-validator saute tous les validateurs d'une propriété
  // absente. Le garde-fou existait et ne gardait rien. Constaté par son propre
  // test, le 11 septembre 2026.
  @Validate(CarteIdentifiable)
  barcode: string;

  /**
   * ⚠ UN NOM OU UN COMPTE LIÉ. La contrainte porte sur l'OBJET, pas sur ce
   * champ : elle est déclarée une fois ci-dessous, sur `firstName`, et lit les
   * trois possibilités. Voir `carte-identifiable.validator.ts`.
   */
  @ApiPropertyOptional({ example: 'Awa', description: 'Prénom de l’adhérent' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Traoré', description: 'Nom de l’adhérent' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @ApiProperty({ example: 'etudiant', description: 'Catégorie (règles de prêt)' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ description: 'Compte utilisateur lié (id du schéma tenant)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: '2027-06-30T00:00:00.000Z',
    description: 'Fin de validité de la carte',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiryDate?: Date;
}

export class UpdatePatronDto extends PartialType(CreatePatronDto) {}

export class ListPatronsDto {
  @ApiPropertyOptional({ description: 'Filtrer par catégorie' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Recherche par code-barres' })
  @IsOptional()
  @IsString()
  q?: string;

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

/** Pagination de l'HISTORIQUE des prêts d'un adhérent (écran du personnel). */
export class PatronLoansDto {
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

/**
 * Recherche de COMPTES À LIER à une carte (écran des adhérents).
 *
 * ⚠ ÉLARGISSEMENT DE DROIT ASSUMÉ, ET DÉLIBÉRÉMENT ÉTROIT. Lire des identités
 * de lecteurs exige aujourd'hui `lecteurs.voir`, que la bibliothécaire n'a pas :
 * elle ne pouvait donc pas trouver le compte à lier, et ne produisait que des
 * cartes anonymes. Cette route lui ouvre STRICTEMENT MOINS que `lecteurs.voir` :
 * quatre champs, comptes ACTIFS, et seulement ceux qui ne sont pas DÉJÀ liés à
 * une carte. Ni statuts, ni file d'attente d'activation, ni comptes du personnel
 * déjà rattachés.
 */
export class ComptesALierDto {
  @ApiPropertyOptional({ description: 'Nom, prénom ou e-mail (insensible à la casse)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
