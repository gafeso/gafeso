import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { MeilisearchEngine } from './meilisearch.engine';
import { MAX_TOTAL_HITS } from './search-engine';

/**
 * LE PLAFOND EST-IL RÉELLEMENT ENVOYÉ À L'INDEX ?
 *
 * ⚠ UNE CONSTANTE DÉCLARÉE DANS LE CODE N'EST PAS UN RÉGLAGE EN BASE. C'est la
 * même leçon que la collation ICU du 11 septembre 2026 : le lot devait porter un
 * garde qui vérifie le réglage LÀ OÙ IL AGIT, pas dans le fichier qui l'énonce.
 *
 * Ici la vérification se fait en deux endroits, et les deux sont nécessaires :
 *  · ce test-ci vérifie que `ensureIndex` TRANSMET le réglage — il tourne dans
 *    `npm test`, sans infrastructure, donc à chaque fois ;
 *  · `search-parity.spec.ts` vérifie que Meilisearch l'a bien ENREGISTRÉ — il
 *    exige un moteur vivant, donc il est gaté.
 *
 * Le premier seul laisserait passer un nom d'option erroné ; le second seul ne
 * tournerait jamais. C'est le second qui manquait le 11 septembre, et le défaut
 * a vécu trois semaines.
 */

const cfg = { get: () => undefined } as unknown as ConfigService;

describe('ensureIndex transmet le plafond de comptage', () => {
  it('⚠ `pagination.maxTotalHits` est envoyé, et vaut la constante déclarée', async () => {
    const engine = new MeilisearchEngine(cfg);
    const updateSettings = vi.fn().mockResolvedValue({ taskUid: 1 });
    (engine as unknown as { client: unknown }).client = {
      index: () => ({ updateSettings }),
    };

    await engine.ensureIndex('zinda');

    expect(updateSettings).toHaveBeenCalledTimes(1);
    const reglages = updateSettings.mock.calls[0][0];
    // Le nom de l'option compte autant que la valeur : `maxTotalHits` mal
    // orthographié serait accepté par le client et ignoré par le serveur.
    expect(reglages.pagination).toEqual({ maxTotalHits: MAX_TOTAL_HITS });
  });

  it('la constante est au-dessus du défaut de Meilisearch — sinon le lot ne sert à rien', () => {
    // ⚠ Ce test ne vérifie pas « une valeur plausible » mais le SEUL fait qui
    // rende le lot utile : 1 000 est le défaut du moteur. Une constante posée
    // à 1 000 ou en dessous laisserait le défaut intact en donnant l'apparence
    // d'un réglage.
    expect(MAX_TOTAL_HITS).toBeGreaterThan(1000);
  });
});

describe("Le moteur DIT quand il a écrêté — les deux branches", () => {
  /**
   * ⚠ CE BLOC VIENT D'UN CONTRÔLE NÉGATIF QUI N'EST PAS TOMBÉ. Remplacer le
   * calcul de `totalPlafonne` par `false` en dur dans l'adaptateur Meilisearch
   * ne cassait RIEN : la suite non gatée n'éprouvait que le service (avec un
   * faux moteur qui posait la marque lui-même), et le test vivant indexe 1 200
   * documents — donc jamais assez pour atteindre le plafond de 100 000, donc
   * `false` dans les deux cas.
   *
   * La ligne qui décide si l'API annonce un jour son plafond n'était couverte
   * par aucun test. Un faux client permet de l'éprouver sans indexer cent mille
   * notices.
   */
  function moteurAvecReponse(totalHits: number) {
    const engine = new MeilisearchEngine(cfg);
    (engine as unknown as { client: unknown }).client = {
      index: () => ({
        search: async () => ({
          hits: [],
          totalHits,
          page: 1,
          totalPages: Math.ceil(totalHits / 20),
          facetDistribution: {},
        }),
      }),
    };
    return engine;
  }

  it('sous le plafond : le total est exact, la marque est absente', async () => {
    const r = await moteurAvecReponse(686).search('zinda', { page: 1, hitsPerPage: 20 });
    expect(r.totalHits).toBe(686);
    expect(r.totalPlafonne).toBe(false);
  });

  it('⚠ AU plafond : la marque est posée — `>=`, pas `>`', async () => {
    // Meilisearch écrête À la valeur : une réponse égale au plafond est
    // indiscernable d'une réponse écrêtée. Dans le doute on annonce le doute —
    // « au moins 100 000 » reste vrai s'il y en a pile 100 000 ; l'inverse non.
    const r = await moteurAvecReponse(MAX_TOTAL_HITS).search('zinda', { page: 1, hitsPerPage: 20 });
    expect(r.totalPlafonne).toBe(true);
  });

  it('juste en dessous du plafond : pas de marque', async () => {
    const r = await moteurAvecReponse(MAX_TOTAL_HITS - 1).search('zinda', { page: 1, hitsPerPage: 20 });
    expect(r.totalPlafonne).toBe(false);
  });
});
