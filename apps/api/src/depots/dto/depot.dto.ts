import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEFENSE_RECORD_TYPES } from '../../cataloging/description-profiles';

/**
 * LE FORMULAIRE EST MINIMAL — fichier, titre, directeur, année, et le type.
 *
 * ⚠ Le reste est du CATALOGAGE, et c'est le métier du bibliothécaire. Un
 * étudiant n'a pas à fournir trois mots-clés : il les choisirait mal, et les
 * exiger de lui ferait renoncer au dépôt.
 */
export class CreerDepotDto {
  @ApiProperty({ example: 'Le droit foncier rural au Burkina Faso' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @ApiProperty({ example: 'Ouédraogo, Salif', description: 'L’auteur du document.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  authorName!: string;

  /**
   * ⚠ VALIDÉ CONTRE LE VOCABULAIRE ACADÉMIQUE, et ce n'est pas décoratif : le
   * PROFIL d'une notice est DÉDUIT de son type (P3-2). Un type hors liste
   * produirait silencieusement une notice `bibliographique`, donc absente
   * d'ETD-MS — et une thèse invisible du dépôt dont dépendent les promotions.
   */
  @ApiProperty({ enum: DEFENSE_RECORD_TYPES, example: 'these' })
  @IsIn(DEFENSE_RECORD_TYPES, {
    message: `Type de document inconnu : attendu ${DEFENSE_RECORD_TYPES.join(', ')}.`,
  })
  documentType!: string;

  @ApiPropertyOptional({ example: 2026, description: 'Année de soutenance.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;

  @ApiPropertyOptional({ description: 'Compte du directeur de mémoire / de thèse.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  directorId?: string;
}

/**
 * Désignation du directeur sur un brouillon.
 *
 * ⚠ L'identifiant vient du menu déroulant que sert `GET /depots/directeurs` —
 * il n'est pas tapé. Le champ ne se valide donc pas plus loin ici : c'est la
 * GARDE du service qui vérifie que la personne porte `depot.valider`, et elle
 * doit le faire de toute façon, l'API étant appelable sans passer par l'écran.
 */
export class DesignerDirecteurDto {
  @ApiProperty({ description: 'Compte du directeur, choisi dans GET /depots/directeurs.' })
  @IsString()
  @IsNotEmpty()
  directorId!: string;
}

/** Le motif d'un refus — jamais vide. */
export class RefuserDepotDto {
  @ApiProperty({ example: 'Le chapitre 3 n’est pas celui de la version soutenue.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  motif!: string;
}

/** Rattachement de la notice créée par le bibliothécaire. */
export class RattacherNoticeDto {
  @ApiProperty({ description: 'Identifiant de la notice créée par le catalogage.' })
  @IsString()
  @IsNotEmpty()
  recordId!: string;
}
