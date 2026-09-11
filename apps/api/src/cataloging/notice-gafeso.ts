/**
 * LA NOTICE GAFESO — le modèle de description, enfin nommé.
 *
 * Gafeso ne décrit PAS ses documents en MARC. Le modèle réel est plat et
 * propriétaire : les colonnes de `biblio_records` plus `record_contributors`,
 * `record_keywords` et `authors`. MARC et Dublin Core sont des formats
 * d'ENTRÉE-SORTIE. Tant que ce modèle n'avait pas de nom dans le code, on
 * croyait disposer d'une couche native conçue comme telle.
 *
 * ⚠ CE FICHIER NE CHANGE AUCUN COMPORTEMENT, et c'est sa raison d'être. Phase
 * P2 : on rend explicite ce qui est implicite, rien d'autre. Il ne remplace
 * aucun accès existant — il est posé À CÔTÉ, jamais à la place. Substituer
 * changerait une réponse, et la phase s'annulerait elle-même.
 *
 * ⚠ POURQUOI UNE DÉCLARATION ET NON UN ACCESSEUR. Un accesseur que personne
 * n'appelle est du code mort, et le refus d'inertie est une règle du dépôt. Une
 * déclaration, elle, a deux consommateurs immédiats : le compilateur, et le
 * test `notice-gafeso.spec.ts` qui la confronte au schéma. C'est P3 qui la
 * consommera à l'exécution, quand le relevé aura dit ce que l'extraction coûte.
 *
 * Le relevé complet — qui lit quoi, avec ses preuves et ses angles morts — est
 * dans `docs/p2-releve-notice.md`. Ce fichier n'en est que la forme vérifiable.
 */

/**
 * Les quatre couches de l'architecture cible, nommées.
 * Voir `architecture-cible-gafeso.md` §3.
 */
export const COUCHES = {
  /** 1 — Identité, titre, auteurs, date, type, langue. Lu par tout le produit. */
  NOYAU: 'noyau',
  /** 2 — Le modèle de description structuré par PROFIL (bibliographique, académique). */
  NOTICE: 'notice',
  /** 3 — La description d'origine, conservée brute avec son format déclaré. */
  NATIVE: 'metadonnees-natives',
  /** 4 — Les projections vers l'extérieur (OAI, SRU, export). */
  EXPOSITION: 'exposition',
} as const;

/**
 * NOYAU — test d'I2 : *nécessaire pour identifier, prêter, ou afficher en
 * liste, quel que soit le type de document ?*
 *
 * ⚠ I2 : le noyau ne grossit jamais. Et il définit ce qui est OBLIGATOIRE, pas
 * ce qui est CHERCHABLE — un champ de profil peut parfaitement être indexé
 * (`defenseUniversity` l'est).
 */
export const CHAMPS_NOYAU = [
  'id', // ⚠ I1 — immuable : c'est le docId des licences signées sur des téléphones
  'title',
  'titleComplement',
  'author',
  'publishYear',
  'language',
  'recordType',
  'category',
  'coverUrl',
  'items',
  'contributors',
  'digitalCopy',
  'holds',
] as const;

/** PROFIL `bibliographique` — livres, périodiques, fonds classique. */
export const CHAMPS_PROFIL_BIBLIOGRAPHIQUE = ['isbn', 'publisher', 'publicationCity'] as const;

/** PROFIL `academique` — thèses, mémoires, articles, rapports. */
export const CHAMPS_PROFIL_ACADEMIQUE = ['defenseUniversity', 'defensePlace'] as const;

/** Hors noyau : ni identification, ni prêt, ni affichage en liste. */
export const CHAMPS_DESCRIPTION = ['summary', 'keywords'] as const;

/**
 * COUCHE 3 — la description d'origine.
 *
 * 🔴 On ne sait PAS si `marcData` est vide ailleurs que sur dev (352/352 à
 * `'{}'`), et cette mesure n'a pas été faite. C'est un inconnu, pas un fait
 * acquis. CONDITION D'EXÉCUTION DE P3 : ne jamais écraser `marc_data` sans
 * avoir vérifié À L'EXÉCUTION, sur l'instance concernée, qu'il est vide — la
 * migration compte les porteuses et refuse de continuer s'il en trouve.
 * Voir `docs/p2-releve-notice.md` §4.
 */
export const CHAMPS_METADONNEES_NATIVES = ['marcData', 'marcFormat'] as const;

/**
 * COUCHE 2 — le profil lui-même, et les champs qui lui appartiennent.
 *
 * `profile` dit DE QUEL profil relève la notice (P3-2) ; `profileData` porte
 * ses champs PROPRES (P3-3). Les deux sont structurels : ils décrivent la
 * notice, ils n'en sont pas le contenu bibliographique.
 *
 * ⚠ `profileData` n'est PAS servi par le contrat public — voir
 * `opac/contrat-notice-publique.ts`. Le servir ferait voyager deux fois les
 * mêmes valeurs (une fois à plat, une fois dans l'objet) pendant toute la
 * coexistence, et changerait la réponse : I7 l'interdit.
 */
export const CHAMPS_STRUCTURE = ['profile', 'profileData'] as const;

/** Horodatages de ligne. Lus pour trier et pour les jetons de moisson OAI. */
export const CHAMPS_TECHNIQUES = ['createdAt', 'updatedAt'] as const;

/**
 * Relations d'intégrité, traversées par AUCUN code depuis la notice.
 *
 * 🔴 `offlineLicenses` rattache les licences hors ligne signées à la notice.
 * Une relation « que personne ne lit » est exactement ce qu'un nettoyage de
 * schéma supprimerait — et cela romprait I1 en silence, sur des téléphones
 * qu'on ne peut pas rejoindre.
 */
export const CHAMPS_INTEGRITE = ['offlineLicenses'] as const;

/**
 * Le classement COMPLET. Tout champ de `BiblioRecord` y figure exactement une
 * fois — c'est ce que le test vérifie.
 *
 * ⚠ C'est le garde-fou contre le défaut nommé en tête du relevé : une colonne
 * ajoutée au modèle part AUTOMATIQUEMENT vers tous les clients, téléphones
 * compris (`recordDetail` renvoie la ligne entière). Elle ne peut désormais
 * plus être ajoutée sans être classée ici, donc sans que quelqu'un décide.
 */
export const CLASSEMENT_NOTICE: Record<string, readonly string[]> = {
  noyau: CHAMPS_NOYAU,
  profilBibliographique: CHAMPS_PROFIL_BIBLIOGRAPHIQUE,
  profilAcademique: CHAMPS_PROFIL_ACADEMIQUE,
  description: CHAMPS_DESCRIPTION,
  metadonneesNatives: CHAMPS_METADONNEES_NATIVES,
  structure: CHAMPS_STRUCTURE,
  techniques: CHAMPS_TECHNIQUES,
  integrite: CHAMPS_INTEGRITE,
};
