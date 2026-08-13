import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';
import {
  RecordSearchDoc,
  SearchEngine,
  SearchParams,
  SearchResult,
  SEARCHABLE_ATTRIBUTES,
} from './search-engine';
import { EqualityClause, FilterClause, parseMeiliFilters } from './meili-filter';

/**
 * Adaptateur Elasticsearch — OPTION « infrastructure existante ». Même contrat
 * que Meilisearch. ⚠ ES réclame 2–4 Go de RAM là où Meilisearch vit dans
 * ~100 Mo : Meilisearch reste le choix RECOMMANDÉ (voir docs/search-engines.md).
 *
 * Parité :
 *  - analyseur français + `asciifolding` → insensible aux accents (« Ouedraogo »
 *    trouve « Ouédraogo »), comme Meilisearch ;
 *  - `fuzziness: AUTO` → tolérance aux fautes de frappe (≈ typo-tolerance Meili) ;
 *  - boosts par champ reproduisant l'ORDRE de poids des searchableAttributes ;
 *  - facettes par agrégations `terms` ; filtres traduits depuis la syntaxe Meili.
 */

// Boosts décroissants = ordre de poids de SEARCHABLE_ATTRIBUTES (title prime,
// summary en dernier). Reproduit la règle « attribute » de Meilisearch.
const FIELD_BOOSTS: Record<string, number> = {
  title: 8,
  titleComplement: 7,
  author: 6,
  contributors: 5,
  keywords: 4,
  defenseUniversity: 3,
  isbn: 2,
  summary: 1,
};

/** Analyseur français insensible aux accents (partagé par tous les champs texte). */
const INDEX_SETTINGS = {
  analysis: {
    filter: {
      french_elision: {
        type: 'elision',
        articles_case: true,
        articles: ['l', 'm', 't', 'qu', 'n', 's', 'j', 'd', 'c', 'jusqu', 'quoiqu', 'lorsqu', 'puisqu'],
      },
      french_stop: { type: 'stop', stopwords: '_french_' },
      french_stemmer: { type: 'stemmer', language: 'light_french' },
    },
    analyzer: {
      // « ai » = accent-insensitive : asciifolding replie « é » → « e ».
      french_ai: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['french_elision', 'lowercase', 'asciifolding', 'french_stop', 'french_stemmer'],
      },
    },
  },
} as const;

function textField() {
  return { type: 'text' as const, analyzer: 'french_ai' };
}

const INDEX_MAPPINGS = {
  properties: {
    id: { type: 'keyword' },
    title: textField(),
    titleComplement: textField(),
    author: textField(),
    contributors: textField(),
    // Affichage seul (relation livre↔auteurs) : non indexé pour la recherche.
    contributorList: { type: 'object', enabled: false },
    keywords: textField(),
    defenseUniversity: textField(),
    isbn: textField(),
    summary: textField(),
    // Filtrables / facettables : valeurs exactes.
    category: { type: 'keyword' },
    language: { type: 'keyword' },
    publishYear: { type: 'integer' },
    recordType: { type: 'keyword' },
    coverUrl: { type: 'keyword', index: false },
  },
} as const;

export class ElasticsearchEngine implements SearchEngine {
  readonly name = 'Elasticsearch';
  private readonly client: Client;

  constructor(config: ConfigService) {
    const node =
      config.get<string>('ELASTIC_NODE') ??
      config.get<string>('ELASTICSEARCH_URL') ??
      'http://localhost:9200';
    const username = config.get<string>('ELASTIC_USERNAME');
    const password = config.get<string>('ELASTIC_PASSWORD');
    this.client = new Client({
      node,
      ...(username && password ? { auth: { username, password } } : {}),
    });
  }

  indexUid(slug: string): string {
    return `records_${slug}`;
  }

  /** Crée l'index (analyseur + mapping) s'il n'existe pas — idempotent. */
  async ensureIndex(slug: string): Promise<void> {
    const index = this.indexUid(slug);
    const exists = await this.client.indices.exists({ index });
    if (exists) return;
    await this.client.indices.create({
      index,
      settings: INDEX_SETTINGS as unknown as Record<string, unknown>,
      mappings: INDEX_MAPPINGS as unknown as Record<string, unknown>,
    });
  }

  async indexRecords(slug: string, docs: RecordSearchDoc[]): Promise<void> {
    if (docs.length === 0) return;
    const index = this.indexUid(slug);
    const operations = docs.flatMap((doc) => [{ index: { _index: index, _id: doc.id } }, doc]);
    // refresh: rend les documents immédiatement cherchables (comme attendu par
    // la réindexation puis recherche, et par les tests de parité).
    const res = await this.client.bulk({ operations, refresh: true });
    if (res.errors) {
      const firstError = res.items.find((i) => i.index?.error)?.index?.error;
      throw new Error(`Indexation Elasticsearch échouée : ${firstError?.reason ?? 'erreur inconnue'}`);
    }
  }

  async removeRecord(slug: string, id: string): Promise<void> {
    try {
      await this.client.delete({ index: this.indexUid(slug), id, refresh: true });
    } catch (error) {
      // Document/index déjà absent : non bloquant (parité avec Meilisearch).
      if ((error as { statusCode?: number }).statusCode === 404) return;
      throw error;
    }
  }

  async clearIndex(slug: string): Promise<void> {
    await this.client.deleteByQuery({
      index: this.indexUid(slug),
      query: { match_all: {} },
      refresh: true,
    });
  }

  async search(slug: string, params: SearchParams): Promise<SearchResult> {
    const size = params.hitsPerPage;
    const from = Math.max(0, (params.page - 1) * size);

    const query = this.buildQuery(params);
    const aggs = Object.fromEntries(
      (params.facets ?? []).map((f) => [f, { terms: { field: f, size: 1000 } }]),
    );

    const res = await this.client.search<RecordSearchDoc>({
      index: this.indexUid(slug),
      from,
      size,
      track_total_hits: true,
      query,
      aggregations: aggs,
    });

    const totalRaw = res.hits.total;
    const total = typeof totalRaw === 'number' ? totalRaw : (totalRaw?.value ?? 0);
    const hits = res.hits.hits.map((h) => h._source as RecordSearchDoc);

    const facetDistribution: SearchResult['facetDistribution'] = {};
    for (const f of params.facets ?? []) {
      const agg = (res.aggregations?.[f] ?? {}) as { buckets?: { key: unknown; doc_count: number }[] };
      facetDistribution[f] = Object.fromEntries(
        (agg.buckets ?? []).map((b) => [String(b.key), b.doc_count]),
      );
    }

    return {
      hits,
      totalHits: total,
      page: params.page,
      totalPages: size > 0 ? Math.ceil(total / size) : total > 0 ? 1 : 0,
      facetDistribution,
    };
  }

  async health(): Promise<boolean> {
    try {
      return await this.client.ping();
    } catch {
      return false;
    }
  }

  // ── Construction de la requête ──────────────────────────────────────────
  private buildQuery(params: SearchParams): Record<string, unknown> {
    const must: Record<string, unknown>[] = [];
    if (params.q && params.q.trim()) {
      const attrs = params.attributesToSearchOn ?? [...SEARCHABLE_ATTRIBUTES];
      const fields = attrs.map((f) => `${f}^${FIELD_BOOSTS[f] ?? 1}`);
      must.push({
        multi_match: {
          query: params.q,
          fields,
          type: 'best_fields',
          fuzziness: 'AUTO', // tolérance aux fautes (≈ typo-tolerance Meilisearch)
        },
      });
    } else {
      must.push({ match_all: {} });
    }
    const filter = parseMeiliFilters(params.filter).map(toEsFilter);
    return { bool: { must, filter } };
  }
}

/** Une clause structurée → un filtre Elasticsearch. */
function toEsFilter(clause: FilterClause): Record<string, unknown> {
  if ('or' in clause) {
    return { bool: { should: clause.or.map(termOf), minimum_should_match: 1 } };
  }
  return termOf(clause);
}

function termOf({ field, value }: EqualityClause): Record<string, unknown> {
  return { term: { [field]: value } };
}
