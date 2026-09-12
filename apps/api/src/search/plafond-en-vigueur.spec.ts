import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { MeilisearchEngine } from './meilisearch.engine';
import { MAX_TOTAL_HITS, RecordSearchDoc } from './search-engine';

/**
 * LE PLAFOND TEL QUE MEILISEARCH L'A ENREGISTRÉ — sur un jeu qui le dépasse.
 *
 * ⚠ C'EST LE GARDE QUI MANQUAIT, ET SON ABSENCE A COÛTÉ TROIS SEMAINES.
 * Le défaut — `totalHits` écrêté à 1 000 — est INVISIBLE en dessous de 1 000
 * notices. Les 352 du fonds de démonstration ne l'atteignent jamais, donc
 * aucun test ne pouvait le voir, donc il a été livré. Il n'apparaît qu'à partir
 * de la 1 001ᵉ notice, c'est-à-dire chez le premier vrai client, et sur ses
 * pages PUBLIQUES.
 *
 * D'où la forme de ce test : **il indexe plus de documents que l'ancien
 * plafond**. Un jeu de 352 documents aurait passé au vert avant comme après,
 * et n'aurait rien dit.
 *
 * ## Pourquoi il est gaté, et ce que ça implique
 *
 * Il exige un Meilisearch VIVANT : on ne peut pas vérifier ce qu'un serveur a
 * enregistré sans le lui demander, et une doublure qui répondrait à sa place
 * serait exactement l'instrument qui reproduit la faute qu'il cherche.
 *
 *   MEILI_LIVE=1 MEILI_MASTER_KEY='<la clé de dev>' \
 *     npx vitest run src/search/plafond-en-vigueur.spec.ts
 *
 * Le versant NON gaté est `plafond-declare-a-l-index.spec.ts` (le réglage est
 * transmis) et `../opac/plafond-du-moteur.spec.ts` (le service ne publie pas un
 * plancher comme un total). Les trois sont nécessaires : le code peut déclarer
 * juste et le serveur ignorer, le serveur peut être réglé et le service mentir
 * quand même.
 */

const SLUG = 'plafondessai';
/** Au-delà du DÉFAUT de Meilisearch (1 000), en dessous du nôtre. */
const DOCUMENTS = 1200;

/**
 * ⚠ UN TEST QUI NE MESURE RIEN DOIT ÊTRE ROUGE. Ces quatre cas commençaient par
 * `if (!pret) return` — la forme la plus courante, et elle rend le test vert
 * quand la préparation échoue. Ici la préparation échoue précisément dans le
 * cas dégradé qu'on veut attraper.
 */
const PRET = 'l’indexation doit avoir abouti, sinon ce test ne mesure rien';

const cfg = {
  get<T = string>(key: string): T | undefined {
    const defauts: Record<string, string> = { MEILI_HOST: 'http://localhost:7700' };
    return (process.env[key] ?? defauts[key]) as T | undefined;
  },
} as unknown as ConfigService;

function doc(i: number): RecordSearchDoc {
  return {
    id: `plafond-${i}`,
    title: `Notice d’essai ${i}`,
    titleComplement: null,
    author: null,
    contributors: [],
    contributorList: [],
    keywords: [],
    defenseUniversity: null,
    isbn: null,
    summary: null,
    publisher: null,
    language: 'fr',
    category: i % 2 === 0 ? 'droit' : 'medecine',
    publishYear: 2020,
    recordType: 'book',
    coverUrl: null,
  } as RecordSearchDoc;
}

describe.runIf(process.env.MEILI_LIVE === '1')('Le plafond en vigueur, sur un jeu qui le dépasse', () => {
  const engine = new MeilisearchEngine(cfg);
  let pret = false;

  beforeAll(async () => {
    if (!(await engine.health())) {
      console.warn('[plafond] Meilisearch injoignable — scénarios ignorés.');
      return;
    }
    await engine.ensureIndex(SLUG);
    await engine.clearIndex(SLUG);
    await engine.indexRecords(SLUG, Array.from({ length: DOCUMENTS }, (_, i) => doc(i)));

    // ⚠ L'ATTENTE SE MESURE SUR LE NOMBRE DE DOCUMENTS DE L'INDEX, JAMAIS SUR
    // `totalHits`, ET LE PREMIER CONTRÔLE NÉGATIF A MONTRÉ POURQUOI.
    //
    // Écrite d'abord en attendant `search().totalHits === DOCUMENTS`, cette
    // préparation utilisait comme SIGNAL la grandeur même que le test éprouve.
    // Résultat, quand le défaut est présent : `totalHits` reste à 1 000,
    // l'attente n'aboutit jamais, `pret` reste faux — et les trois tests qui
    // commencent par `if (!pret) return` sortent en SILENCE. La suite annonçait
    // « 1 échec, 3 réussites » là où la vérité est « 1 échec, 3 tests qui n'ont
    // rien mesuré ». Trois lignes vertes qui ressemblent à de la couverture.
    const stats = (engine as unknown as {
      client: { index: (u: string) => { getStats: () => Promise<{ numberOfDocuments: number }> } };
    }).client;
    for (let i = 0; i < 200; i++) {
      const n = (await stats.index(engine.indexUid(SLUG)).getStats()).numberOfDocuments;
      if (n === DOCUMENTS) { pret = true; break; }
      await new Promise((r2) => setTimeout(r2, 300));
    }
    if (!pret) console.warn('[plafond] indexation non stabilisée.');
  }, 120_000);

  afterAll(async () => {
    await engine.clearIndex(SLUG).catch(() => undefined);
  });

  it('⚠ 1 200 notices → totalHits vaut 1 200, pas 1 000', async () => {
    expect(pret, PRET).toBe(true);
    const res = await engine.search(SLUG, { q: '', page: 1, hitsPerPage: 20 });

    // LE défaut, à l'endroit exact où il se manifestait.
    expect(res.totalHits).toBe(DOCUMENTS);
    expect(res.totalHits).not.toBe(1000);
    expect(res.totalPages).toBe(Math.ceil(DOCUMENTS / 20));
    expect(res.totalPlafonne).toBe(false);
  });

  it('la 1 001ᵉ notice est atteignable — la pagination ne s’arrête plus avant la fin', async () => {
    expect(pret, PRET).toBe(true);
    // Sous l'ancien plafond, `page: 51` (hitsPerPage 20) rendait une liste vide :
    // la recherche publique ne menait jamais au-delà de la 1 000ᵉ notice.
    const res = await engine.search(SLUG, { q: '', page: 51, hitsPerPage: 20 });
    expect(res.hits.length).toBeGreaterThan(0);
  });

  it('les facettes et le total s’accordent désormais', async () => {
    expect(pret, PRET).toBe(true);
    const res = await engine.search(SLUG, { q: '', page: 1, hitsPerPage: 1, facets: ['category'] });
    const somme = Object.values(res.facetDistribution.category ?? {}).reduce((t, n) => t + n, 0);

    // C'est la contradiction mesurée le 11 septembre sur le fonds de 8 000 :
    // totalHits 1 000, somme des facettes 8 000, dans la MÊME réponse.
    expect(res.totalHits).toBe(somme);
  });

  it('countDocuments rend ce que l’index CONTIENT, pas ce qu’une recherche compte', async () => {
    expect(pret, PRET).toBe(true);

    // ⚠ LA DISTINCTION EST TOUT L'OBJET DE LA MÉTHODE (backlog n°19).
    // `totalHits` répond à une REQUÊTE et se fait écrêter par `maxTotalHits` ;
    // `countDocuments` demande à l'index ce qu'il porte. C'est la seule
    // grandeur comparable au `count()` de la base — et comparer deux grandeurs
    // voisines mais différentes est la faute qu'on a déjà payée sur le garde
    // d'idempotence du seed.
    expect(await engine.countDocuments(SLUG)).toBe(DOCUMENTS);
  });

  it('⚠ le plafond ENREGISTRÉ par le serveur est celui que le code déclare', async () => {
    expect(pret, PRET).toBe(true);
    // La vérification qui ne peut pas se faire sans le serveur : `ensureIndex`
    // peut transmettre une option que Meilisearch ignore (nom changé entre
    // versions). On lit donc le réglage tel qu'il est EN VIGUEUR.
    const client = (engine as unknown as { client: { index: (u: string) => { getSettings: () => Promise<{ pagination?: { maxTotalHits?: number } }> } } }).client;
    const reglages = await client.index(engine.indexUid(SLUG)).getSettings();

    expect(reglages.pagination?.maxTotalHits).toBe(MAX_TOTAL_HITS);
  });
});
