import { Prisma } from '@prisma/client';

/**
 * LES TRIS DISPONIBLES SUR `/cataloging/records`.
 *
 * ⚠ CE FICHIER A CHANGÉ DE RAISON D'ÊTRE LE 11 SEPTEMBRE 2026, et l'ancienne
 * était devenue FAUSSE. Il existait pour REFUSER le tri alphabétique : l'image
 * `postgres:16-alpine` ne contient aucune locale, donc le `en_US.utf8` déclaré
 * retombait sur l'ordre des octets, et « École » se classait après
 * « Zoologie ».
 *
 * La collation `fr-x-icu` est désormais posée sur les colonnes texte
 * (`tenancy/collation-francaise.ts`, backlog n° 14), et un garde branché dans
 * `sync-schema` la rattrape si une migration la perd. Le motif du refus n'est
 * donc plus vrai — et un refus dont le motif est faux est un défaut, pas une
 * prudence.
 *
 * ⚠ L'INTERDIT DEVIENT UNE RÈGLE VÉRIFIABLE : une colonne TEXTE peut être
 * exposée au tri **si elle est déclarée collationnée**. C'est mieux qu'une
 * liste noire, parce que la condition est testable et qu'elle reste vraie pour
 * la colonne qu'on exposera demain. Le test `tri-du-catalogue.spec.ts` la
 * tient : toute colonne texte de la liste blanche doit figurer dans
 * `COLONNES_COLLATIONNEES`, ou porter une justification écrite.
 */

/**
 * Les colonnes exposées au tri.
 *
 * `createdAt`, `publishYear` et `recordType` ne dépendent pas de la collation.
 * `title` et `author` en dépendent, et sont exposés parce qu'ils sont
 * COLLATIONNÉS — le test l'exige, il ne le suppose pas.
 */
export const TRIS_DISPONIBLES = [
  'createdAt',
  'publishYear',
  'recordType',
  'title',
  'author',
] as const;
export type TriDisponible = (typeof TRIS_DISPONIBLES)[number];

export const TRI_PAR_DEFAUT: TriDisponible = 'createdAt';
export const SENS_PAR_DEFAUT = 'desc';

/**
 * Les tris écartés, avec leur motif — ils sont déclarés pour que le refus
 * puisse être expliqué, et pour que le garde-fou puisse vérifier qu'ils ne
 * migrent pas dans la liste blanche par inadvertance.
 */
/**
 * Colonnes texte NON exposées au tri, avec leur motif.
 *
 * ⚠ CE N'EST PLUS « parce que la collation est fausse » — elle ne l'est plus.
 * C'est parce qu'aucun écran ne les trie : exposer un tri que personne ne
 * demande, c'est un paramètre d'API de plus à tenir pour rien.
 */
export const TRIS_REFUSES = {
  titleComplement: 'aucun écran ne trie sur le complément de titre',
  publisher: 'aucun écran ne trie sur l’éditeur',
} as const;

export const MESSAGE_TRI_INVALIDE =
  `Tri inconnu. Valeurs acceptées : ${TRIS_DISPONIBLES.join(', ')}.`;

/**
 * Construit le `orderBy` de la liste paginée.
 *
 * ⚠ LE DÉPARTAGE PAR `id` EST AJOUTÉ ICI, ET NON À L'APPEL. Sans lui, les
 * lignes qui partagent la clé de tri sortent dans un ordre indéfini d'une page
 * à l'autre : certaines apparaissent deux fois, d'autres jamais (mesuré sur le
 * catalogue : 339 collisions sur 352 notices). Le rendre inséparable du tri est
 * ce qui empêche une huitième route de l'oublier.
 */
export function construireOrderBy(
  tri: TriDisponible = TRI_PAR_DEFAUT,
  sens: 'asc' | 'desc' = SENS_PAR_DEFAUT,
): Prisma.BiblioRecordOrderByWithRelationInput[] {
  // `publishYear` est nullable : les notices sans année vont EN DERNIER dans
  // les deux sens. Sans ce réglage, Postgres les met en tête d'un tri
  // décroissant — la liste s'ouvrirait sur les notices dont on ignore l'année.
  // `publishYear` est nullable, `author` aussi : les notices sans valeur vont
  // EN DERNIER dans les deux sens. Sans ce réglage, Postgres les met en tête
  // d'un tri décroissant — la liste s'ouvrirait sur les notices dont on ignore
  // l'année, ou sur celles sans auteur.
  const nullable = tri === 'publishYear' || tri === 'author';
  const principal: Prisma.BiblioRecordOrderByWithRelationInput = nullable
    ? ({ [tri]: { sort: sens, nulls: 'last' } } as Prisma.BiblioRecordOrderByWithRelationInput)
    : ({ [tri]: sens } as Prisma.BiblioRecordOrderByWithRelationInput);

  return [principal, { id: sens }];
}
