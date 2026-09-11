/**
 * LA COLLATION FRANÇAISE DES COLONNES TEXTE — backlog n° 14.
 *
 * ⚠ LE DÉFAUT QU'ELLE CORRIGE EST ACTIF AUJOURD'HUI, pas en projet. L'image
 * `postgres:16-alpine` ne contient AUCUNE locale (`locale -a` ne rend rien) :
 * le `en_US.utf8` que déclare la base retombe donc sur l'ordre des OCTETS, où
 * les majuscules accentuées passent après `Z`.
 *
 *   par défaut ......... Anatomie < Economie < Zoologie < École < Éthique
 *   COLLATE "fr-x-icu" . Anatomie < École < Economie < Éthique < Zoologie
 *
 * Mesuré : 20 des 352 titres du fonds de démonstration commencent par une
 * lettre accentuée. Dans une bibliothèque burkinabè, c'est visible à la
 * première page — et la liste des auteurs trie déjà sur `display_name`.
 *
 * ⚠ AUCUN CHANGEMENT D'IMAGE : ICU est déjà compilé dans `postgres:16-alpine`,
 * et `fr-x-icu` comme `fr-BF-x-icu` existent. C'était la crainte, elle est
 * levée.
 *
 * ⚠ `fr-x-icu` ET NON `fr-BF-x-icu` : les règles de collation françaises sont
 * identiques, et la variante nationale surprendrait dans un déploiement
 * multi-pays. Un jour où une école non francophone existe, c'est la colonne
 * `locale` de l'établissement qui devra décider — pas ce fichier.
 *
 * ⚠ ET LA VÉRIFICATION EST MESURÉE, PAS DÉDUITE : `fr-x-icu` est DÉTERMINISTE
 * (`collisdeterministic = t`), donc `LIKE` et `ILIKE` continuent de
 * fonctionner — ce dont dépend la recherche `q` de `/cataloging/records` — et
 * l'égalité distingue toujours les accents, donc les clés de comparaison ne
 * changent pas de sens. Une collation NON déterministe aurait interdit `LIKE`
 * sur ces colonnes et cassé la recherche en silence.
 */

export const COLLATION = 'fr-x-icu';

export interface ColonneCollationnee {
  table: string;
  colonne: string;
}

/**
 * Colonnes à collationner — celles qui portent du TEXTE LU PAR UN HUMAIN.
 *
 * ⚠ LE CRITÈRE EST « LU », PAS « TRIÉ ». Déclarer seulement les colonnes
 * triées aujourd'hui rendrait FAUX le premier tri ajouté demain, et rien ne le
 * signalerait — un tri sur une colonne non collationnée ne lève rien, il classe
 * simplement mal. Le coût d'une colonne de plus est mesuré : 90 ms pour
 * 100 000 lignes, index reconstruit par Postgres.
 */
export const COLONNES_COLLATIONNEES: readonly ColonneCollationnee[] = [
  { table: 'biblio_records', colonne: 'title' },
  { table: 'biblio_records', colonne: 'title_complement' },
  { table: 'biblio_records', colonne: 'author' },
  { table: 'biblio_records', colonne: 'publisher' },
  { table: 'authors', colonne: 'display_name' },
  { table: 'patrons', colonne: 'first_name' },
  { table: 'patrons', colonne: 'last_name' },
  { table: 'users', colonne: 'first_name' },
  { table: 'users', colonne: 'last_name' },
  { table: 'expected_students', colonne: 'first_name' },
  { table: 'expected_students', colonne: 'last_name' },
  { table: 'school_classes', colonne: 'name' },
  { table: 'school_classes', colonne: 'label' },
  { table: 'keywords', colonne: 'name' },
  { table: 'categories', colonne: 'name' },
  { table: 'roles', colonne: 'name' },
];

/**
 * Colonnes DÉLIBÉRÉMENT NON collationnées, avec leur motif.
 *
 * Elles sont listées pour être vues : sans cette liste, la prochaine relecture
 * les prendrait pour un oubli et les ajouterait.
 */
export const COLONNES_NON_COLLATIONNEES: Record<string, string> = {
  'authors.normalized_name':
    'CLÉ DE DÉDUPLICATION (minuscule, sans accents) — comparée pour égalité, ' +
    'jamais affichée ni triée. La collationner changerait la sémantique d’une ' +
    'clé sans améliorer aucun affichage.',
  'users.class_name':
    'CLÉ DE COMPARAISON : confrontée telle quelle à `school_classes.name` par ' +
    'access-control. On ne touche pas aux deux côtés d’une comparaison pour un ' +
    'gain d’affichage nul.',
  'expected_students.class_name': 'Même raison que `users.class_name`.',
  'items.barcode': 'CODE, pas du texte lu — un code-barres n’a pas d’ordre alphabétique.',
  'items.call_number': 'COTE : son ordre suit les règles de classement de la bibliothèque, pas celles du français.',
  'items.location': 'CODE de localisation.',
};

/** `collections` vit dans le schéma PUBLIC, pas dans les schémas tenant. */
export const COLONNES_COLLATIONNEES_PUBLIC: readonly ColonneCollationnee[] = [
  { table: 'collections', colonne: 'name' },
];
