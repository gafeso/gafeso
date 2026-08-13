import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { MeilisearchEngine } from './meilisearch.engine';
import { ElasticsearchEngine } from './elasticsearch.engine';
import { RecordSearchDoc, SearchEngine } from './search-engine';

/**
 * SUITE DE PARITÉ — exécutée contre LES DEUX moteurs (Meilisearch ET
 * Elasticsearch), même seed, mêmes scénarios. Elle a besoin des DEUX moteurs
 * VIVANTS ; elle est donc GATÉE par SEARCH_PARITY=1 et absente du `npm test`
 * ordinaire (qui reste à 423, sans dépendance réseau). Lancer :
 *
 *   docker compose --profile elasticsearch up -d elasticsearch
 *   SEARCH_PARITY=1 MEILI_MASTER_KEY=meili_dev_master_key \
 *     npx vitest run src/search/search-parity.spec.ts
 *
 * Les différences de CLASSEMENT inévitables (typo-tolérance Meili vs fuzziness
 * ES) ne sont PAS asserties à l'identique — on vérifie l'ENSEMBLE de résultats,
 * pas l'ordre exact. Voir docs/search-engines.md.
 */

const SLUG = 'paritytest';

// Config minimale : lit process.env avec des défauts de dev.
const cfg = {
  get<T = string>(key: string): T | undefined {
    const defaults: Record<string, string> = {
      MEILI_HOST: 'http://localhost:7700',
      MEILI_MASTER_KEY: 'meili_dev_master_key',
      ELASTIC_NODE: 'http://localhost:9200',
    };
    return (process.env[key] ?? defaults[key]) as T | undefined;
  },
} as unknown as ConfigService;

// Jeu de données contrôlé — expectations EXACTES.
function doc(over: Partial<RecordSearchDoc> & { id: string; title: string }): RecordSearchDoc {
  return {
    titleComplement: null,
    author: null,
    contributors: [],
    contributorList: [],
    keywords: [],
    defenseUniversity: null,
    isbn: null,
    summary: null,
    category: null,
    language: 'fr',
    publishYear: 2020,
    recordType: 'ouvrage',
    coverUrl: null,
    ...over,
  };
}

const SEED: RecordSearchDoc[] = [
  doc({
    id: 'r1',
    title: 'Droit constitutionnel burkinabè',
    author: 'Traoré, Awa',
    contributors: ['Traoré, Awa'],
    category: 'droit',
    isbn: '978-0-000-00001-1',
    summary: 'Un traité de référence.',
  }),
  doc({
    id: 'r2',
    title: 'Anatomie générale',
    author: 'Ouédraogo, Salif',
    contributors: ['Ouédraogo, Salif'],
    category: 'medecine',
    // ISBN volontairement distinctif pour le test « ISBN exclu du mode Titre ».
    isbn: 'ZZUNIQUEISBN999',
    summary: 'Le mot droit apparaît ici dans le résumé seulement.',
  }),
  doc({
    id: 'r3',
    title: 'Le droit foncier rural',
    author: 'Sankara, Aïcha',
    contributors: ['Sankara, Aïcha'],
    category: 'droit',
    isbn: '978-0-000-00003-3',
  }),
];

const ENGINES: { name: string; make: () => SearchEngine }[] = [
  { name: 'Meilisearch', make: () => new MeilisearchEngine(cfg) },
  { name: 'Elasticsearch', make: () => new ElasticsearchEngine(cfg) },
];

/** Attend que l'indexation soit visible (Meili indexe en tâche de fond). */
async function waitReady(engine: SearchEngine, expected: number): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    const res = await engine.search(SLUG, { q: '', page: 1, hitsPerPage: 0, facets: ['category'] });
    if (res.totalHits === expected) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

describe.runIf(process.env.SEARCH_PARITY === '1').each(ENGINES)(
  'Parité moteur : $name',
  ({ make }) => {
    let engine: SearchEngine;
    let ready = false;

    beforeAll(async () => {
      engine = make();
      if (!(await engine.health())) {
        console.warn(`[parité] ${engine.name} injoignable — scénarios ignorés.`);
        return;
      }
      await engine.ensureIndex(SLUG);
      await engine.clearIndex(SLUG);
      await engine.indexRecords(SLUG, SEED);
      ready = await waitReady(engine, SEED.length);
      if (!ready) console.warn(`[parité] ${engine.name} : indexation non stabilisée.`);
    }, 30_000);

    afterAll(async () => {
      if (ready) await engine.clearIndex(SLUG).catch(() => undefined);
    });

    const ids = (hits: RecordSearchDoc[]) => hits.map((h) => h.id).sort();

    it('recherche par titre (dans=titre) : ISBN et résumé EXCLUS', async () => {
      if (!ready) return;
      // « droit » restreint au titre → r1 et r3 (titre), jamais r2 (droit dans le résumé).
      const res = await engine.search(SLUG, {
        q: 'droit',
        page: 1,
        hitsPerPage: 20,
        attributesToSearchOn: ['title', 'titleComplement'],
      });
      expect(ids(res.hits)).toEqual(['r1', 'r3']);
    });

    it('recherche par auteur (mode global)', async () => {
      if (!ready) return;
      const res = await engine.search(SLUG, { q: 'Sankara', page: 1, hitsPerPage: 20 });
      expect(res.hits.map((h) => h.id)).toContain('r3');
    });

    it('ISBN exclu du mode Titre, trouvable en mode global', async () => {
      if (!ready) return;
      const inTitle = await engine.search(SLUG, {
        q: 'ZZUNIQUEISBN999',
        page: 1,
        hitsPerPage: 20,
        attributesToSearchOn: ['title', 'titleComplement'],
      });
      expect(inTitle.totalHits).toBe(0);
      const global = await engine.search(SLUG, { q: 'ZZUNIQUEISBN999', page: 1, hitsPerPage: 20 });
      expect(global.hits.map((h) => h.id)).toEqual(['r2']);
    });

    it('facettes avec compteurs corrects', async () => {
      if (!ready) return;
      const res = await engine.search(SLUG, { q: '', page: 1, hitsPerPage: 0, facets: ['category'] });
      expect(res.facetDistribution.category).toEqual({ droit: 2, medecine: 1 });
      expect(res.totalHits).toBe(3);
    });

    it('accents : « ouedraogo » trouve « Ouédraogo », « aicha » trouve « Aïcha »', async () => {
      if (!ready) return;
      const r1 = await engine.search(SLUG, { q: 'ouedraogo', page: 1, hitsPerPage: 20 });
      expect(r1.hits.map((h) => h.id)).toContain('r2');
      const r2 = await engine.search(SLUG, { q: 'aicha', page: 1, hitsPerPage: 20 });
      expect(r2.hits.map((h) => h.id)).toContain('r3');
    });

    it('tolérance aux fautes : « constitutionel » (titre) trouve la notice', async () => {
      if (!ready) return;
      // On vérifie la PRÉSENCE, pas le classement (Meili et ES ne classent pas
      // identiquement une correction de faute — voir docs/search-engines.md).
      const res = await engine.search(SLUG, {
        q: 'constitutionel',
        page: 1,
        hitsPerPage: 20,
        attributesToSearchOn: ['title', 'titleComplement'],
      });
      expect(res.hits.map((h) => h.id)).toContain('r1');
    });
  },
);
