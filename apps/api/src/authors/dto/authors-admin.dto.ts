import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Autocomplétion : suggestions d'auteurs par nom. */
export class AuthorSuggestDto {
  @ApiProperty()
  @IsString()
  q!: string;
}

/** Renommage d'une fiche auteur (propagé partout). */
export class RenameAuthorDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  displayName!: string;

  /**
   * ⚠ TROIS CHAMPS QUE LA FICHE SERVAIT DÉJÀ ET QUE PERSONNE NE POUVAIT
   * REMPLIR. `GET /authors/:id` rend `bio`, `birthYear` et `deathYear` depuis
   * toujours ; aucune route ne les écrivait. L'écran d'une fiche d'autorité
   * affichait donc trois cases vides à jamais — et c'est précisément ce qu'un
   * fichier d'autorités existe pour porter.
   *
   * Troisième colonne sans écrivain trouvée le 12 septembre 2026, après
   * `Author.userId` et `embargoUntil`.
   *
   * ⚠ `null` EST UNE VALEUR : on efface une date de naissance entrée par
   * erreur. D'où `@ValidateIf` — `@IsOptional` traiterait `null` comme
   * « ne rien changer », et la correction serait impossible.
   */
  @ApiPropertyOptional({ nullable: true, description: 'Notice biographique.' })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(4000)
  bio?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 1948 })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(2200)
  birthYear?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 2019 })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(2200)
  deathYear?: number | null;
}

/** Fusion : bascule les contributions de la fiche courante vers `intoId`. */
export class MergeAuthorDto {
  @ApiProperty({ description: 'Fiche à conserver ; la fiche courante est absorbée puis supprimée.' })
  @IsUUID()
  intoId!: string;
}

/**
 * Filtre et PARCOURS de la liste admin des auteurs.
 *
 * ⚠ `page` ET `limit` ONT ÉTÉ AJOUTÉS LE 11 SEPTEMBRE 2026, ET LE SERVICE LES
 * ACCEPTAIT DÉJÀ. `listAuthors` gère `page`/`limit` depuis toujours, avec
 * départage (`displayName`, puis `id`), et la réponse porte `total`, `page` et
 * `totalPages`. C'est ce DTO seul qui refusait les paramètres : avec
 * `forbidNonWhitelisted`, `GET /authors?page=2` rendait
 * `400 property page should not exist`.
 *
 * La route DÉCRIVAIT donc un parcours qu'elle n'offrait pas — et le contrôleur
 * forçait `limit: 200`. L'écran affichait 200 auteurs sur 278 pour l'école de
 * démonstration, sans compteur et sans un mot : une bibliothécaire cherchant un
 * auteur au-delà du deux-centième ne le trouvait pas. Depuis toujours. Relevé
 * par la session frontend sur un fonds de 8 000 notices (200 sur 557), pour un
 * défaut qui tenait à deux cent soixante-dix-huit auteurs.
 *
 * L'invariant qui empêche la récidive est dans
 * `src/common/pagination-acceptee.spec.ts` : une réponse qui annonce un
 * parcours doit l'ACCEPTER.
 */
export class AuthorsListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * Rattachement d'une fiche d'autorité à un compte — ou détachement.
 *
 * ⚠ `userId: null` EST UNE VALEUR, PAS UNE ABSENCE. Détacher doit être possible
 * — un rattachement erroné attribue à quelqu'un les encadrements d'un homonyme,
 * et ce qui se pose doit se défaire. D'où `@ValidateIf` plutôt qu'`@IsOptional`,
 * qui traiterait `null` comme « ne rien faire » : le champ est OBLIGATOIRE, sa
 * valeur peut être nulle.
 */
export class RattacherAuteurAuCompteDto {
  @ApiProperty({
    nullable: true,
    description: 'Compte à rattacher, ou `null` pour détacher la fiche.',
  })
  @ValidateIf((_o, valeur) => valeur !== null)
  @IsString()
  @IsNotEmpty()
  userId!: string | null;
}
