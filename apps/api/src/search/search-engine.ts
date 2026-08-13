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
  totalHits: number;
  page: number;
  totalPages: number;
  /** facette → { valeur: compteur }. */
  facetDistribution: Record<string, Record<string, number>>;
}

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
  /** Le moteur répond-il ? (healthcheck, jamais jeter → false si KO). */
  health(): Promise<boolean>;
}
