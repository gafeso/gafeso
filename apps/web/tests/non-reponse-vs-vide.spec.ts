/**
 * Une non-réponse ne s'écrit pas comme un « vide ».
 *
 * Motif corrigé ici : appliquer une valeur par défaut (`?? 0`, `?? []`) à une
 * donnée qui n'a PAS ENCORE CHARGÉ, ou dont le chargement a ÉCHOUÉ. Le défaut
 * a l'air inoffensif — il produit un rendu plausible — mais il transforme une
 * non-réponse en affirmation, et l'affirmation est fausse.
 *
 * Le cas de `fetchConstellation` était le plus grave du produit : en échec, il
 * renvoyait `{ totalRecords: 0, domains: [] }`, la page d'accueil PUBLIQUE
 * masquait alors toute sa section catalogue ET son entrée de navigation, et se
 * présentait comme complète. Une panne serveur se lisait « cette bibliothèque
 * n'a pas de catalogue », devant un étudiant, une DSI, un bailleur.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const REPONSE = {
  totalRecords: 12,
  domains: [
    { category: 'droit', count: 7 },
    { category: 'arts', count: 5 },
  ],
};

function brancherFetch(mode: 'ok' | 'http500' | 'reseau') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      if (mode === 'reseau') return Promise.reject(new Error('ECONNREFUSED'));
      if (mode === 'http500') {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(REPONSE) } as Response);
    }),
  );
  // fetchTenant journalise les échecs : on ne veut pas polluer la sortie.
  vi.stubGlobal('console', { ...console, error: vi.fn() });
}

/** Import tardif : le module lit des en-têtes Next au chargement. */
async function fetchConstellation() {
  vi.resetModules();
  vi.doMock('next/headers', () => ({
    headers: async () => new Map([['host', 'localhost']]) as unknown as Headers,
  }));
  const mod = await import('@/lib/server-api');
  return mod.fetchConstellation();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('next/headers');
});

describe('fetchConstellation — trois états, jamais deux', () => {
  it('réponse : rend les domaines et le total réels', async () => {
    brancherFetch('ok');
    const c = await fetchConstellation();
    expect(c).not.toBeNull();
    expect(c!.totalRecords).toBe(12);
    expect(c!.domains).toHaveLength(2);
  });

  it('erreur HTTP : rend null, PAS une constellation vide', async () => {
    brancherFetch('http500');
    const c = await fetchConstellation();
    // Le cœur du lot : `{totalRecords: 0, domains: []}` serait indiscernable
    // d'un catalogue réellement vide.
    expect(c).toBeNull();
  });

  it('API injoignable : rend null, PAS une constellation vide', async () => {
    brancherFetch('reseau');
    expect(await fetchConstellation()).toBeNull();
  });

  it('ne fabrique jamais un zéro à partir d’une absence de réponse', async () => {
    for (const mode of ['http500', 'reseau'] as const) {
      brancherFetch(mode);
      const c = await fetchConstellation();
      expect(c, mode).toBeNull();
      // Contrôle explicite : si un jour on retombe sur un objet, il ne doit
      // en aucun cas annoncer « 0 ressource, 0 domaine ».
      expect(c === null || (c as { totalRecords: number }).totalRecords !== 0).toBe(true);
      vi.unstubAllGlobals();
    }
  });
});
