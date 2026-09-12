/**
 * LE CONTRAT DE `/opac/records/:id` — figé, déclaré, et non plus déduit.
 *
 * LE DÉFAUT CORRIGÉ (relevé P2, §1). La route interrogeait avec `include` puis
 * étalait la ligne : elle renvoyait donc **toute** la table. 26 clés servies
 * pour 9 utilisées par le mobile — et surtout, **toute colonne ajoutée au
 * modèle partait automatiquement vers tous les clients**, téléphones compris,
 * sans qu'aucune décision ne le prévoie. Ce n'était pas une hypothèse :
 * `profile`, ajouté par la migration P0, était déjà servi.
 *
 * L'invariant I7 protège contre les RETRAITS de champs. Rien ne protégeait
 * contre les AJOUTS.
 *
 * ⚠ CE LOT NE RÉTRÉCIT PAS LA RÉPONSE, IL LA GÈLE. Passer aux 9 champs utiles
 * casserait I7 sur des APK déjà installés qu'on ne peut pas rejoindre. La
 * réponse garde donc EXACTEMENT les mêmes 26 clés, dans le MÊME ordre — mais
 * elles sont désormais énumérées ici. Une colonne nouvelle n'y entre plus
 * toute seule : il faut l'ajouter à une de ces listes, donc décider.
 *
 * La coexistence, c'est cela : le contrat cesse d'être le miroir du schéma. Le
 * réduire aux 9 champs reste possible plus tard — ce sera un lot annoncé, avec
 * une période où les deux formes coexistent, pas un effet de bord.
 */

/**
 * Colonnes servies TELLES QUELLES, dans l'ordre exact du contrat.
 *
 * ⚠ L'ORDRE COMPTE. Le filet de comparaison compare des octets : deux réponses
 * aux mêmes clés dans un ordre différent ne sont pas identiques. Cet ordre est
 * celui relevé sur l'API en service avant le gel.
 */
export const COLONNES_SERVIES = [
  'id',
  'marcData',
  'marcFormat',
  'profile',
  'recordType',
  'title',
  'titleComplement',
  'author',
  'isbn',
  'publishYear',
  'language',
  'publisher',
  'publicationCity',
  'defenseUniversity',
  'defensePlace',
  /**
   * ⚠ SERVI, ET C'EST LE POINT DE L'EMBARGO (P6-4).
   *
   * « Les métadonnées sont visibles, le fichier non. » Une notice dont le
   * fichier refuse SANS DIRE POURQUOI serait exactement le faux silencieux que
   * ce dépôt passe son temps à corriger : le lecteur conclurait à une panne, et
   * réessaierait. Servir la date, c'est répondre à « pourquoi ? » avant qu'on
   * la pose — et une thèse sous embargo reste ainsi CITABLE, ce qui est l'objet
   * même du dépôt.
   */
  'embargoUntil',
  'summary',
  'coverUrl',
  'category',
  'createdAt',
  'updatedAt',
] as const;

/** Relations servies, dans l'ordre du contrat. `keywords` est aplati en chaînes. */
export const RELATIONS_SERVIES = ['contributors', 'keywords', 'items'] as const;

/**
 * Servie mais PROJETÉE : seul `fileFormat` sort.
 *
 * ⚠ Ni l'URL ni la clé objet ne quittent la couche d'accès — elles passent par
 * `/read`, avec contrôle d'accès et URL signée à expiration courte. Le `select`
 * ci-dessous ne va donc même pas les chercher en base : ce qu'on ne lit pas ne
 * peut pas fuir.
 */
export const RELATION_PROJETEE = 'digitalCopy' as const;

/** Calculées, jamais stockées. */
export const CLES_CALCULEES = ['availability', 'membersOnly'] as const;

/**
 * Champs du modèle DÉLIBÉRÉMENT NON SERVIS.
 *
 * 🔴 `offlineLicenses` rattache les licences hors ligne signées aux notices :
 * son `recordId` est le `docId` de baux déployés sur des téléphones. Elle n'est
 * traversée par aucun code et reste invisible à la lecture — c'est exactement
 * ce qu'un nettoyage supprimerait, et cela romprait I1 en silence. Elle est
 * listée ici pour être vue, pas pour être servie.
 *
 * ⚠ `profileData` (P3-3) porte les champs propres au profil —
 * `publicationCity`, `defenseUniversity`, `defensePlace`. Il n'est PAS servi,
 * et ce n'est pas un oubli : ces trois valeurs continuent de voyager À PLAT,
 * aux clés que le mobile connaît. Servir l'objet EN PLUS les ferait voyager
 * deux fois et ajouterait une clé à la réponse — I7 l'interdit. Le jour où le
 * mobile saura lire l'objet, ce sera une décision annoncée, pas un effet de
 * bord de l'extraction.
 */
export const NON_SERVIS = ['holds', 'offlineLicenses', 'profileData'] as const;

/**
 * L'ordre complet des clés de la réponse. Sert de contrat exécutable : un test
 * échoue si la route s'en écarte, dans un sens ou dans l'autre.
 */
export const CLES_DU_CONTRAT: string[] = [
  ...COLONNES_SERVIES,
  ...RELATIONS_SERVIES,
  'availability',
  RELATION_PROJETEE,
  'membersOnly',
];

/**
 * Le `select` Prisma, DÉRIVÉ de la déclaration — jamais écrit deux fois.
 * Deux listes à tenir d'accord finiraient par divergier.
 */
/**
 * Colonnes LUES mais NON SERVIES — la distinction est neuve, et elle compte.
 *
 * Jusqu'à P3-3, `COLONNES_SERVIES` décidait à la fois de ce qu'on va CHERCHER
 * en base et de ce qui SORT dans la réponse. Les deux divergent désormais :
 * `profileData` doit être chargé — il porte `publicationCity`,
 * `defenseUniversity` et `defensePlace` — sans jamais apparaître dans la
 * réponse, où ces trois valeurs continuent de voyager à plat.
 *
 * ⚠ Confondre les deux listes servirait l'objet EN PLUS des trois clés : une
 * clé de plus dans la réponse, donc I7 cassé, et les mêmes valeurs transportées
 * deux fois.
 */
export const COLONNES_LUES_NON_SERVIES = ['profileData'] as const;

export function selectNoticePublique() {
  const colonnes = Object.fromEntries(
    [...COLONNES_SERVIES, ...COLONNES_LUES_NON_SERVIES].map((c) => [c, true]),
  );
  return {
    ...colonnes,
    contributors: { orderBy: { position: 'asc' as const } },
    keywords: { select: { keyword: { select: { name: true } } } },
    items: true,
    // Seul le format : voir RELATION_PROJETEE.
    digitalCopy: { select: { fileFormat: true } },
  };
}
