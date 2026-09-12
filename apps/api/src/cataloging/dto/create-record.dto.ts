import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarcFormat } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CONTRIBUTOR_ROLES, ContributorRole } from '../contributor-roles';
import { DEFAULT_RECORD_TYPE, RECORD_TYPES } from '../description-profiles';

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

  /**
   * ⚠ VOCABULAIRE FERMÉ (backlog n°22). Il était `@IsString()` libre : toute
   * chaîne entrait en base, et le PROFIL de la notice en est DÉDUIT — un type
   * hors liste produisait silencieusement une notice `bibliographique`, donc
   * absente d'ETD-MS. `UpdateRecordDto` hérite de cette validation par
   * `PartialType`, donc la fermeture vaut aussi pour la modification.
   */
  @ApiPropertyOptional({
    enum: RECORD_TYPES,
    example: 'ouvrage',
    default: DEFAULT_RECORD_TYPE,
  })
  @IsOptional()
  @IsIn(RECORD_TYPES, {
    message: `Type de notice inconnu : attendu ${RECORD_TYPES.join(', ')}.`,
  })
  recordType?: string;

  /**
   * ⚠ LA DATE DE LEVÉE D'EMBARGO — et sans ce champ, l'embargo de P6-4 n'était
   * POSABLE PAR PERSONNE.
   *
   * La colonne existait, la décision d'accès la lisait, le contrat public la
   * servait, quatorze tests la couvraient. **Aucune route ne l'écrivait.** Une
   * thèse sous confidentialité ne pouvait pas être déclarée telle : le refus
   * était complet et inatteignable. C'est exactement ce qu'on venait de fermer
   * sur `Author.userId`, le même jour, sur le lot livré le matin même.
   *
   * ⚠ `null` EST UNE VALEUR, PAS UNE ABSENCE — d'où `@ValidateIf` plutôt
   * qu'`@IsOptional`, qui traiterait `null` comme « ne rien changer ». Lever un
   * embargo AVANT sa date est un geste légitime (le jury libère la thèse) et il
   * faut pouvoir l'exprimer. Champ absent = inchangé ; `null` = plus d'embargo.
   *
   * Aucune borne sur la date : une date PASSÉE est acceptée, et elle signifie
   * simplement « embargo levé ». Refuser le passé obligerait à connaître
   * l'horloge du serveur pour effacer un embargo, ce qui est absurde.
   */
  @ApiPropertyOptional({
    nullable: true,
    example: '2027-01-01',
    description:
      'Date de levée d’embargo. Les métadonnées restent publiques ; le fichier ' +
      'refuse jusqu’à cette date. `null` retire l’embargo.',
  })
  @ValidateIf((_o, valeur) => valeur !== null && valeur !== undefined)
  @IsDateString(
    {},
    { message: 'La date de levée d’embargo doit être une date ISO (AAAA-MM-JJ).' },
  )
  embargoUntil?: string | null;

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
