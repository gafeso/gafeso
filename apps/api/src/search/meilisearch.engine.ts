import { MeiliSearch } from 'meilisearch';
import { ConfigService } from '@nestjs/config';
import {
  FILTERABLE_ATTRIBUTES,
  RecordSearchDoc,
  SearchEngine,
  SearchParams,
  SearchResult,
  SEARCHABLE_ATTRIBUTES,
  SORTABLE_ATTRIBUTES,
} from './search-engine';

/**
 * Adaptateur Meilisearch — le moteur PAR DÉFAUT et recommandé (vit dans ~100 Mo
 * de RAM). Un index par école : `records_<slug>`, aligné sur l'isolation des
 * schémas PostgreSQL. Comportement IDENTIQUE à l'implémentation historique
 * (extrait sans changement) — seule la dégradation gracieuse de `search` est
 * remontée dans la façade `SearchService`.
 */
export class MeilisearchEngine implements SearchEngine {
  readonly name = 'Meilisearch';
  private readonly client: MeiliSearch;

  constructor(config: ConfigService) {
    this.client = new MeiliSearch({
      host: config.get<string>('MEILI_HOST') ?? 'http://localhost:7700',
      apiKey: config.get<string>('MEILI_MASTER_KEY'),
    });
  }

  indexUid(slug: string): string {
    return `records_${slug}`;
  }

  async ensureIndex(slug: string): Promise<void> {
    await this.client.index(this.indexUid(slug)).updateSettings({
      // `keywords` filtrable : prêt pour de futurs filtres OPAC (§5).
      filterableAttributes: [...FILTERABLE_ATTRIBUTES],
      sortableAttributes: [...SORTABLE_ATTRIBUTES],
      // Ordre = poids de pertinence (règle « attribute » de Meilisearch).
      searchableAttributes: [...SEARCHABLE_ATTRIBUTES],
    });
  }

  async indexRecords(slug: string, docs: RecordSearchDoc[]): Promise<void> {
    if (docs.length === 0) return;
    await this.client.index(this.indexUid(slug)).addDocuments(docs, { primaryKey: 'id' });
  }

  async removeRecord(slug: string, id: string): Promise<void> {
    await this.client.index(this.indexUid(slug)).deleteDocument(id);
  }

  async clearIndex(slug: string): Promise<void> {
    await this.client.index(this.indexUid(slug)).deleteAllDocuments();
  }

  async search(slug: string, params: SearchParams): Promise<SearchResult> {
    const res = await this.client.index(this.indexUid(slug)).search(params.q ?? '', {
      filter: params.filter,
      page: params.page,
      hitsPerPage: params.hitsPerPage,
      facets: params.facets,
      ...(params.attributesToSearchOn
        ? { attributesToSearchOn: params.attributesToSearchOn }
        : {}),
    });
    return {
      hits: res.hits as RecordSearchDoc[],
      totalHits: res.totalHits,
      page: res.page,
      totalPages: res.totalPages,
      facetDistribution: (res.facetDistribution as SearchResult['facetDistribution']) ?? {},
    };
  }

  async health(): Promise<boolean> {
    try {
      return await this.client.isHealthy();
    } catch {
      return false;
    }
  }
}
