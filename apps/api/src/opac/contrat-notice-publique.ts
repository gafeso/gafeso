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
  /**
   * ⚠ P7-3, ET CE N'EST PAS UNE COLONNE. La provenance est CALCULÉE : elle
   * vient de `harvested_records`, pas de `biblio_records`. Elle n'entre donc ni
   * dans `COLONNES_SERVIES` ni dans le `select` — mais elle entre dans le
   * contrat, parce que c'est lui qui décrit la RÉPONSE.
   *
   * `null` pour une notice catalloguée localement, un objet pour une notice
   * moissonnée. C'est la décision 1 du brief P7 rendue lisible : ce qui arrive
   * par moissonnage reste marqué comme tel.
   *
   * ⚠ EN DERNIER : une clé neuve s'ajoute à la fin, pour qu'un filet qui
   * compare des octets lise un AJOUT et non une permutation.
   */
  'provenance',
  /**
   * ⚠ DEUX BOOLÉENS, ET PAS UN — mesuré le 8 octobre 2026 avant de les écrire.
   *
   * Les deux passations clientes demandaient « `hasDigital` », et elles n'en
   * donnaient PAS le même sens : le front « l'EXISTENCE d'une version en ligne,
   * publique », le mobile « `digital_copies.enc_status = 'ready'` ». En base,
   * les deux prédicats s'accordent sur **155 copies sur 155** — donc leur
   * divergence est invisible, et c'est « deux sources qui s'accordent PAR
   * COÏNCIDENCE ».
   *
   * Elle naît par CONSTRUCTION, et deux chemins du produit la produisent :
   *   · un EPUB téléversé — `fichier-numerique.ts` l'accepte, et l'ingestion
   *     est gardée par `if (format === DigitalFormat.PDF)` : `enc_status` reste
   *     **null** et la lecture EN LIGNE marche ;
   *   · un PDF à xref irréparable — `encStatus: 'failed'`, avec la lecture en
   *     ligne **conservée** (`digital-copy.service.ts` l'écrit : « ne casse
   *     JAMAIS la lecture en ligne »).
   *
   * Un seul booléen mentirait donc à l'un des deux clients, et les deux
   * mensonges ne coûtent pas la même chose :
   *   · `enc_status='ready'` seul → l'OPAC public dit « aucun document » sur un
   *     EPUB qui se lit en ligne. Faux NÉGATIF qui cache ce qui existe, c'est-à-
   *     dire l'inverse exact de la raison pour laquelle ce champ est public ;
   *   · `digitalCopy != null` seul → le mobile promet une lecture hors ligne qui
   *     échoue au téléchargement, « au pire moment » (leurs mots).
   *
   * D'où deux noms qui DISENT ce qu'ils portent. Aucun des deux clients n'a
   * encore livré sa lecture — les deux passations écrivent « l'app l'attend » —
   * donc c'est le moment, et le seul, où les nommer juste ne casse rien.
   *
   * ⚠ EN DERNIER, après `provenance`, pour la raison déjà écrite : un filet qui
   * compare des octets doit lire un AJOUT, jamais une permutation.
   */
  'hasDigital',
  'offlineReady',
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
    // Le format, et `encStatus` qui est LU sans être servi : il décide
    // `offlineReady`. La forme de `digitalCopy` ne change pas d'un octet —
    // l'ajouter à l'objet servi serait une modification de contrat, et ce n'est
    // pas ce qu'on a décidé.
    digitalCopy: { select: { fileFormat: true, encStatus: true } },
  };
}
