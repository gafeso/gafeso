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
 *   SEARCH_PARITY=1 MEILI_MASTER_KEY='<la clé de votre .env>' \
 *     npx vitest run src/search/search-parity.spec.ts
 *
 * ⚠ LA LIGNE CI-DESSUS MONTRAIT LA VALEUR, ET LE DÉFAUT PLUS BAS LA PORTAIT EN
 * DUR. Corrigé le 12 septembre 2026. `CLAUDE.md` l'interdit en toutes lettres —
 * « la documentation d'une procédure qui prend un secret montre la VARIABLE,
 * jamais la VALEUR » — et la règle ne se module pas selon la valeur du secret,
 * sinon il faut juger à chaque fois, et c'est ce jugement exercé à chaud qui a
 * produit les cinq occurrences précédentes.
 *
 * Aggravant ici, et c'est ce qui a décidé du lot : `apps/` part dans
 * l'instantané public (`scripts/publier-instantane.sh`), donc cette valeur
 * était PUBLIÉE — et c'était la clé réellement en service sur la base de
 * développement, pas une valeur d'exemple.
 *
 * Les différences de CLASSEMENT inévitables (typo-tolérance Meili vs fuzziness
 * ES) ne sont PAS asserties à l'identique — on vérifie l'ENSEMBLE de résultats,
 * pas l'ordre exact. Voir docs/search-engines.md.
 */

const SLUG = 'paritytest';

/**
 * Configuration minimale : `process.env`, avec des défauts pour les seules
 * valeurs qui ne sont PAS des secrets — une adresse d'hôte locale n'en est pas
 * une. `MEILI_MASTER_KEY` n'a donc aucun défaut : elle vient de
 * l'environnement, ou elle manque, et alors on le DIT.
 */
const cfg = {
  get<T = string>(key: string): T | undefined {
    const defauts: Record<string, string> = {
      MEILI_HOST: 'http://localhost:7700',
      ELASTIC_NODE: 'http://localhost:9200',
    };
    return (process.env[key] ?? defauts[key]) as T | undefined;
  },
} as unknown as ConfigService;

/**
 * ⚠ SANS CLÉ, CETTE SUITE DOIT ÊTRE ROUGE, PAS VERTE.
 *
 * Elle est gatée par `SEARCH_PARITY=1` : quelqu'un qui pose ce drapeau a
 * l'intention de mesurer. Si la clé manque, chaque appel à Meilisearch échouera
 * en 401 et les scénarios tomberaient de toute façon — mais sur des messages
 * d'authentification incompréhensibles, à dix endroits. Une assertion unique et
 * nommée vaut mieux, et c'est la leçon promue en tête de `CLAUDE.md` :
 * `if (préparation manquante) return` rend VERT un test qui n'a rien exercé.
 */
function exigerLaCle(): void {
  expect(
    process.env.MEILI_MASTER_KEY,
    'MEILI_MASTER_KEY absente : cette suite ne peut RIEN mesurer sans elle. ' +
      'Passez-la en variable d’environnement (la valeur est dans votre .env).',
  ).toBeTruthy();
}

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

/**
 * ⚠ CE QUE CE FICHIER A TU PENDANT DES SEMAINES, et qui a été trouvé le
 * 13 septembre 2026 en balayant les gestes antérieurs à nos règles.
 *
 * Ses six cas commençaient par `if (!ready) return`. Elasticsearch vit dans un
 * PROFIL Docker dédié (`--profile elasticsearch`), donc il n'est presque jamais
 * démarré : ses six cas sortaient en SILENCE, et la suite annonçait douze
 * réussites. **La parité entre les deux moteurs n'avait jamais été mesurée du
 * côté Elasticsearch** — alors que prouver leur accord est la seule raison
 * d'être de ce fichier.
 *
 * Depuis, l'attente est une ASSERTION : un test qui ne peut pas mesurer est
 * ROUGE. Poser `SEARCH_PARITY=1` sans démarrer les deux moteurs échoue
 * désormais, et c'est l'information qu'on veut — pas six lignes vertes.
 *
 *   docker compose --env-file .env -f docker/docker-compose.yml \
 *     --profile elasticsearch up -d elasticsearch
 */
describe.runIf(process.env.SEARCH_PARITY === '1').each(ENGINES)(
  'Parité moteur : $name',
  ({ make }) => {
    let engine: SearchEngine;
    let ready = false;

    beforeAll(async () => {
      exigerLaCle();
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
      // ⚠ UNE ASSERTION, PAS UN `return`. La forme `if (!ready) return` rend
      // VERT un test qui n'a rien exercé : si l'indexation ne se stabilise pas,
      // les six cas de cette parité sortaient en silence et la suite annonçait
      // six réussites. C'est la leçon du 11 septembre 2026, écrite pour le
      // plafond Meilisearch — et ce fichier, repris le 12, la portait encore.
      //
      // Un test qui ne PEUT pas mesurer doit être ROUGE : l'infrastructure
      // absente est une information, pas une dispense.
      expect(ready, 'indexation non stabilisée : ce test ne mesure rien').toBe(true);
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
      // ⚠ UNE ASSERTION, PAS UN `return`. La forme `if (!ready) return` rend
      // VERT un test qui n'a rien exercé : si l'indexation ne se stabilise pas,
      // les six cas de cette parité sortaient en silence et la suite annonçait
      // six réussites. C'est la leçon du 11 septembre 2026, écrite pour le
      // plafond Meilisearch — et ce fichier, repris le 12, la portait encore.
      //
      // Un test qui ne PEUT pas mesurer doit être ROUGE : l'infrastructure
      // absente est une information, pas une dispense.
      expect(ready, 'indexation non stabilisée : ce test ne mesure rien').toBe(true);
      const res = await engine.search(SLUG, { q: 'Sankara', page: 1, hitsPerPage: 20 });
      expect(res.hits.map((h) => h.id)).toContain('r3');
    });

    it('ISBN exclu du mode Titre, trouvable en mode global', async () => {
      // ⚠ UNE ASSERTION, PAS UN `return`. La forme `if (!ready) return` rend
      // VERT un test qui n'a rien exercé : si l'indexation ne se stabilise pas,
      // les six cas de cette parité sortaient en silence et la suite annonçait
      // six réussites. C'est la leçon du 11 septembre 2026, écrite pour le
      // plafond Meilisearch — et ce fichier, repris le 12, la portait encore.
      //
      // Un test qui ne PEUT pas mesurer doit être ROUGE : l'infrastructure
      // absente est une information, pas une dispense.
      expect(ready, 'indexation non stabilisée : ce test ne mesure rien').toBe(true);
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
      // ⚠ UNE ASSERTION, PAS UN `return`. La forme `if (!ready) return` rend
      // VERT un test qui n'a rien exercé : si l'indexation ne se stabilise pas,
      // les six cas de cette parité sortaient en silence et la suite annonçait
      // six réussites. C'est la leçon du 11 septembre 2026, écrite pour le
      // plafond Meilisearch — et ce fichier, repris le 12, la portait encore.
      //
      // Un test qui ne PEUT pas mesurer doit être ROUGE : l'infrastructure
      // absente est une information, pas une dispense.
      expect(ready, 'indexation non stabilisée : ce test ne mesure rien').toBe(true);
      const res = await engine.search(SLUG, { q: '', page: 1, hitsPerPage: 0, facets: ['category'] });
      expect(res.facetDistribution.category).toEqual({ droit: 2, medecine: 1 });
      expect(res.totalHits).toBe(3);
    });

    it('accents : « ouedraogo » trouve « Ouédraogo », « aicha » trouve « Aïcha »', async () => {
      // ⚠ UNE ASSERTION, PAS UN `return`. La forme `if (!ready) return` rend
      // VERT un test qui n'a rien exercé : si l'indexation ne se stabilise pas,
      // les six cas de cette parité sortaient en silence et la suite annonçait
      // six réussites. C'est la leçon du 11 septembre 2026, écrite pour le
      // plafond Meilisearch — et ce fichier, repris le 12, la portait encore.
      //
      // Un test qui ne PEUT pas mesurer doit être ROUGE : l'infrastructure
      // absente est une information, pas une dispense.
      expect(ready, 'indexation non stabilisée : ce test ne mesure rien').toBe(true);
      const r1 = await engine.search(SLUG, { q: 'ouedraogo', page: 1, hitsPerPage: 20 });
      expect(r1.hits.map((h) => h.id)).toContain('r2');
      const r2 = await engine.search(SLUG, { q: 'aicha', page: 1, hitsPerPage: 20 });
      expect(r2.hits.map((h) => h.id)).toContain('r3');
    });

    it('tolérance aux fautes : « constitutionel » (titre) trouve la notice', async () => {
      // ⚠ UNE ASSERTION, PAS UN `return`. La forme `if (!ready) return` rend
      // VERT un test qui n'a rien exercé : si l'indexation ne se stabilise pas,
      // les six cas de cette parité sortaient en silence et la suite annonçait
      // six réussites. C'est la leçon du 11 septembre 2026, écrite pour le
      // plafond Meilisearch — et ce fichier, repris le 12, la portait encore.
      //
      // Un test qui ne PEUT pas mesurer doit être ROUGE : l'infrastructure
      // absente est une information, pas une dispense.
      expect(ready, 'indexation non stabilisée : ce test ne mesure rien').toBe(true);
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
