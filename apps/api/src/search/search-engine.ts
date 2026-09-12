/**
 * Contrat d'un moteur de recherche, EXTRAIT de l'usage réel de l'application
 * (Meilisearch historique) — pas un contrat théorique. Deux implémentations :
 * `MeilisearchEngine` (défaut) et `ElasticsearchEngine` (option). La façade
 * `SearchService` choisit l'une ou l'autre selon SEARCH_ENGINE et conserve la
 * dégradation gracieuse (un moteur injoignable ne fait jamais planter l'app).
 */

/** Un contributeur tel qu'affiché dans les résultats (nom + rôle, ordonné). */
export interface RecordContributorDoc {
  name: string;
  /** AUTEUR_PRINCIPAL | AUTEUR_SECONDAIRE | DIRECTEUR_MEMOIRE */
  role: string;
  /** Fiche d'autorité liée → le nom du résultat pointe vers /opac/auteurs/:id.
   *  Null pour les notices pas encore rattachées (repli recherche par nom). */
  authorId?: string | null;
}

/** Document indexé pour une notice (un index par école). */
export interface RecordSearchDoc {
  id: string;
  title: string;
  titleComplement: string | null;
  author: string | null;
  /** Noms des contributeurs, TOUS rôles (directeur de mémoire compris — §5).
   *  Attribut CHERCHABLE (poids de pertinence, voir SEARCHABLE_ATTRIBUTES). */
  contributors: string[];
  /** Contributeurs ORDONNÉS (principal, secondaires, directeur), avec leur rôle.
   *  Attribut d'AFFICHAGE seul : permet aux résultats de montrer la relation
   *  livre↔auteurs sans re-requêter la base. */
  contributorList: RecordContributorDoc[];
  keywords: string[];
  defenseUniversity: string | null;
  isbn: string | null;
  /** Résumé — cherchable au POIDS LE PLUS FAIBLE : un livre où le terme est
   *  l'auteur remonte devant un livre qui ne fait que le citer dans le résumé. */
  summary: string | null;
  category: string | null;
  language: string;
  publishYear: number | null;
  recordType: string;
  coverUrl: string | null;
}

export interface SearchParams {
  q?: string;
  /**
   * Expressions de filtre en syntaxe Meilisearch (ex. `category = "droit"`,
   * `publishYear = 2020`, `(category = "a" OR category = "b")`). Combinées en
   * AND. C'est le FORMAT RÉEL produit par l'OPAC (opac.service) et verrouillé
   * par les tests — l'adaptateur Meili les passe tels quels, l'adaptateur ES
   * traduit ce sous-ensemble (voir meili-filter.ts).
   */
  filter?: string[];
  page: number;
  hitsPerPage: number;
  facets?: string[];
  /** Restreint la recherche à un sous-ensemble d'attributs (recherche par champ,
   *  §5). Sous-ensemble des attributs cherchables. */
  attributesToSearchOn?: string[];
}

/** Résultat de recherche — forme consommée par l'OPAC (hits + facettes). */
export interface SearchResult {
  hits: RecordSearchDoc[];
  /**
   * ⚠ CE NOMBRE N'EST UN TOTAL QUE SI `totalPlafonne` EST FAUX. Au-delà du
   * plafond du moteur, c'est un PLANCHER — « au moins tant ».
   */
  totalHits: number;
  page: number;
  totalPages: number;
  /** facette → { valeur: compteur }. */
  facetDistribution: Record<string, Record<string, number>>;
  /**
   * `true` quand le moteur a cessé de compter avant la fin : `totalHits` et
   * `totalPages` sont alors des planchers, pas des totaux.
   *
   * ⚠ CHAMP OBLIGATOIRE, ET C'EST DÉLIBÉRÉ. Optionnel, il aurait valu
   * `undefined` chez tout appelant qui l'ignore — c'est-à-dire « pas plafonné »
   * à la lecture, donc l'affirmation fausse rétablie par omission. Obligatoire,
   * le compilateur va chercher chaque moteur et chaque doublure.
   */
  totalPlafonne: boolean;
}

/**
 * PLAFOND DE COMPTAGE DU MOTEUR — `maxTotalHits` de Meilisearch.
 *
 * ## Le défaut
 *
 * Le défaut de Meilisearch est **1 000**. Au-delà, `totalHits` se tait sans le
 * dire : il rend 1 000 et `totalPages` suit. Sur un fonds de 8 000 notices
 * (mesuré le 11 septembre 2026, index de développement `records_horizon`), la
 * même réponse portait `totalHits: 1000` et une distribution de facettes
 * totalisant **8 000** — les facettes, elles, ne sont pas plafonnées.
 *
 * La conséquence était PUBLIQUE : l'accueil affirmait « 1 000 ressources » pour
 * un fonds de 8 000, et la recherche ne menait jamais au-delà de la 1 000ᵉ
 * notice.
 *
 * ## Ce que coûte un plafond plus haut : rien, à cette échelle
 *
 * Mesuré le 11 septembre 2026 sur un index jetable de **200 000 documents**
 * (25 fois le fonds d'essai), plafond porté de 1 000 à 10 000 puis 200 000 :
 *
 * | Requête | plafond 1 000 | plafond 200 000 |
 * |---|---|---|
 * | recherche vide, page 1 (20) | 1 ms | 1 ms |
 * | recherche « e » (154 075 réponses), page 1 | 3 ms | 4 ms |
 * | recherche vide, DERNIÈRE page atteignable | 0 ms | 2 ms (page 10 000) |
 * | mémoire du conteneur | 185 Mo | 186 Mo |
 *
 * Le plafond ne borne pas un coût qui se paierait ici : il borne la pagination
 * profonde d'un service public exposé, ce que Meilisearch dimensionne pour du
 * SaaS ouvert. À l'échelle d'un catalogue d'école, le coût ne se mesure pas.
 *
 * ## Pourquoi 100 000 et pas l'infini
 *
 * Parce qu'un plafond plus haut reste un plafond, et qu'un jour quelqu'un le
 * dépassera. C'est pourquoi la valeur est accompagnée de `totalPlafonne` : le
 * chiffre ne sera jamais présenté comme exact quand il ne l'est pas. La valeur,
 * elle, met la borne au-delà de tout fonds d'école réaliste — les plus grandes
 * bibliothèques universitaires d'Afrique de l'Ouest se comptent en centaines de
 * milliers de notices, pas en millions.
 *
 * ⚠ APPLIQUÉ PAR `ensureIndex`, donc à la première écriture d'index de chaque
 * école. Une école dont l'index n'est jamais réécrit garde son ancien plafond
 * jusqu'au prochain `/cataloging/reindex`.
 */
export const MAX_TOTAL_HITS = 100_000;

/**
 * Réglages d'index partagés par les deux moteurs — source unique de vérité pour
 * la PARITÉ (mêmes attributs filtrables/cherchables, même ordre de poids).
 */
export const FILTERABLE_ATTRIBUTES = [
  'category',
  'language',
  'publishYear',
  'recordType',
  'keywords',
] as const;

export const SORTABLE_ATTRIBUTES = ['title', 'publishYear'] as const;

/**
 * Attributs cherchables, DANS L'ORDRE DE POIDS (le premier prime). Un match
 * dans `title`/`author` classe devant un match dans `summary` : un livre dont X
 * est l'auteur remonte devant un livre qui ne fait que citer X dans le résumé
 * (demande directrice BUC). Les deux moteurs respectent cet ordre.
 */
export const SEARCHABLE_ATTRIBUTES = [
  'title',
  'titleComplement',
  'author',
  'contributors',
  'keywords',
  'defenseUniversity',
  'isbn',
  // Le plus faible : plein texte du résumé, sans jamais primer l'auteur.
  'summary',
] as const;

/**
 * Le contrat commun. Les méthodes d'écriture (ensureIndex/index/remove/clear)
 * et `search` PEUVENT jeter ; la dégradation gracieuse est assurée par les
 * appelants (`safeIndex`/`safeRemove` de cataloging, et `SearchService.search`).
 */
export interface SearchEngine {
  /** Nom lisible du moteur (log de démarrage). */
  readonly name: string;
  /** Identifiant d'index d'une école. */
  indexUid(slug: string): string;
  /** Crée/mets à jour l'index et ses réglages (idempotent). */
  ensureIndex(slug: string): Promise<void>;
  /** Indexe (remplace) des documents complets. */
  indexRecords(slug: string, docs: RecordSearchDoc[]): Promise<void>;
  /** Supprime un document par id. */
  removeRecord(slug: string, id: string): Promise<void>;
  /** Vide l'index (avant réindexation complète). */
  clearIndex(slug: string): Promise<void>;
  /** Recherche paginée + facettes. */
  search(slug: string, params: SearchParams): Promise<SearchResult>;
  /**
   * Nombre de documents RÉELLEMENT dans l'index de cette école.
   *
   * ⚠ CE N'EST PAS `totalHits` D'UNE RECHERCHE VIDE, et la différence est tout
   * l'objet de cette méthode : `totalHits` est écrêté par `maxTotalHits`, et
   * il répond à une requête. Ici on demande à l'index ce qu'il CONTIENT —
   * la seule grandeur comparable au `count()` de la base.
   *
   * Jette si le moteur ne répond pas : c'est `SearchService` qui traduit.
   */
  countDocuments(slug: string): Promise<number>;
  /** Le moteur répond-il ? (healthcheck, jamais jeter → false si KO). */
  health(): Promise<boolean>;
}
