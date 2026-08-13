import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RecordContributorDoc,
  RecordSearchDoc,
  SearchEngine,
  SearchParams,
  SearchResult,
} from './search-engine';
import { MeilisearchEngine } from './meilisearch.engine';
import { ElasticsearchEngine } from './elasticsearch.engine';

// Ré-exports : les consommateurs importent ces symboles depuis
// `../search/search.service` — chemins conservés pour ne rien casser.
export {
  RecordContributorDoc,
  RecordSearchDoc,
  SearchParams,
  SearchResult,
  SearchEngine,
} from './search-engine';

/**
 * Construit le document d'indexation depuis une notice, quel que soit le chemin
 * d'appel : accepte les mots-clés sous leur forme de liaison Prisma
 * (`{ keyword: { name } }[]`) OU déjà aplatie (`string[]`), et des contributeurs
 * absents (notice pas encore migrée → repli sur l'ancien champ auteur pour
 * rester cherchable). Le moteur remplaçant les documents en entier à
 * l'indexation, TOUT indexeur doit passer par ici — un document partiel
 * écraserait les champs des autres.
 */
export function buildRecordSearchDoc(record: {
  id: string;
  title: string;
  titleComplement?: string | null;
  author: string | null;
  isbn: string | null;
  category: string | null;
  language: string;
  publishYear: number | null;
  recordType: string;
  defenseUniversity?: string | null;
  summary?: string | null;
  coverUrl: string | null;
  contributors?: { name: string; role?: string; position?: number; authorId?: string | null }[];
  keywords?: string[] | { keyword: { name: string } }[];
}): RecordSearchDoc {
  const ordered = [...(record.contributors ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );
  const contributorList: RecordContributorDoc[] =
    ordered.length > 0
      ? ordered.map((c) => ({
          name: c.name,
          role: c.role ?? 'AUTEUR_PRINCIPAL',
          authorId: c.authorId ?? null,
        }))
      : record.author
        ? [{ name: record.author, role: 'AUTEUR_PRINCIPAL', authorId: null }]
        : [];
  return {
    id: record.id,
    title: record.title,
    titleComplement: record.titleComplement ?? null,
    author: record.author,
    contributors: contributorList.map((c) => c.name),
    contributorList,
    keywords: (record.keywords ?? []).map((k) => (typeof k === 'string' ? k : k.keyword.name)),
    defenseUniversity: record.defenseUniversity ?? null,
    isbn: record.isbn,
    summary: record.summary ?? null,
    category: record.category,
    language: record.language,
    publishYear: record.publishYear,
    recordType: record.recordType,
    coverUrl: record.coverUrl,
  };
}

/**
 * Façade de recherche : choisit le moteur (Meilisearch par défaut,
 * Elasticsearch en option) selon SEARCH_ENGINE, délègue le contrat, et préserve
 * la DÉGRADATION GRACIEUSE historique — un moteur injoignable renvoie un
 * résultat de recherche vide (facettes à 0), JAMAIS une 500. L'indexation, elle,
 * est protégée chez les appelants (`safeIndex`/`safeRemove` de cataloging).
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly engine: SearchEngine;

  constructor(config: ConfigService) {
    this.engine = SearchService.resolveEngine(config, this.logger);
  }

  /** Sélection du moteur au démarrage, avec message de log clair. */
  private static resolveEngine(config: ConfigService, logger: Logger): SearchEngine {
    const choice = (config.get<string>('SEARCH_ENGINE') ?? 'meilisearch').trim().toLowerCase();
    switch (choice) {
      case 'meilisearch':
      case '':
        logger.log('Moteur de recherche : Meilisearch (défaut).');
        return new MeilisearchEngine(config);
      case 'elasticsearch':
        logger.log(
          'Moteur de recherche : Elasticsearch (option). ⚠ ES exige 2–4 Go de RAM ' +
            '— Meilisearch reste recommandé (voir docs/search-engines.md).',
        );
        return new ElasticsearchEngine(config);
      default:
        // Valeur non reconnue : repli SÛR sur Meilisearch (jamais planter au boot).
        logger.warn(
          `SEARCH_ENGINE="${choice}" non reconnu (meilisearch | elasticsearch) — repli sur Meilisearch.`,
        );
        return new MeilisearchEngine(config);
    }
  }

  indexUid(slug: string): string {
    return this.engine.indexUid(slug);
  }

  ensureIndex(slug: string): Promise<void> {
    return this.engine.ensureIndex(slug);
  }

  indexRecords(slug: string, docs: RecordSearchDoc[]): Promise<void> {
    return this.engine.indexRecords(slug, docs);
  }

  removeRecord(slug: string, id: string): Promise<void> {
    return this.engine.removeRecord(slug, id);
  }

  clearIndex(slug: string): Promise<void> {
    return this.engine.clearIndex(slug);
  }

  /** Le moteur répond-il ? (exposé au healthcheck de l'API.) */
  health(): Promise<boolean> {
    return this.engine.health();
  }

  /**
   * Recherche paginée avec facettes (OPAC, page constellation comprise). Ne DOIT
   * jamais faire planter l'appelant : un index absent (école tout juste
   * provisionnée) ou un moteur injoignable renvoient un résultat vide (facettes
   * à 0), jamais une 500 — l'OPAC reste consultable, juste vide, le temps de
   * relancer une réindexation (voir scripts/reindex.mjs).
   */
  async search(slug: string, params: SearchParams): Promise<SearchResult> {
    try {
      return await this.engine.search(slug, params);
    } catch (error) {
      this.logger.warn(
        `Recherche ${this.engine.name} indisponible (${slug}) : ${(error as Error).message} — résultat vide renvoyé.`,
      );
      return {
        hits: [],
        totalHits: 0,
        page: params.page,
        totalPages: 0,
        facetDistribution: Object.fromEntries((params.facets ?? []).map((f) => [f, {}])),
      };
    }
  }
}
