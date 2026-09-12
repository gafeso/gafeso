import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
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
  ValidateIf,
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

/**
 * ⚠ DEUX CHAMPS REDÉCLARÉS, ET C'EST NÉCESSAIRE : `PartialType` rend tout
 * facultatif, il n'ajoute pas `| null`. Sans ces deux lignes, **une carte liée
 * au mauvais compte ne pouvait JAMAIS être déliée**, et une date de fin de
 * validité posée par erreur ne pouvait jamais être retirée.
 *
 * ⚠ LE LIEN DE COMPTE N'EST PAS UN DÉTAIL D'ÉTAT CIVIL. `cardForUser` part du
 * compte pour trouver la carte : une carte liée au mauvais étudiant lui montre
 * les prêts d'un autre. Le geste qui répare devait exister.
 *
 * Troisième fois le 12 septembre 2026 qu'un `null` inexprimable bloque une
 * correction — après l'embargo et les dates de la fiche d'autorité. La forme
 * est toujours la même : `@ValidateIf` au lieu d'`@IsOptional`, et le service
 * distingue `undefined` (inchangé) de `null` (effacé).
 */
export class UpdatePatronDto extends PartialType(
  // ⚠ `OmitType` AVANT `PartialType` : redéclarer un champ avec un type PLUS
  // LARGE que celui de la classe de base est refusé par TypeScript. On retire
  // donc les deux champs du parent plutôt que de les contredire — et le compte
  // reste vérifiable, les deux sont redéclarés juste en dessous.
  OmitType(CreatePatronDto, ['userId', 'expiryDate'] as const),
) {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Compte utilisateur lié. `null` DÉLIE la carte de son compte.',
  })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsUUID()
  userId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Fin de validité. `null` rend la carte à durée illimitée.',
  })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @Type(() => Date)
  @IsDate()
  expiryDate?: Date | null;
}

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
