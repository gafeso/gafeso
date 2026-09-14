/**
 * Un auteur qui n'existe pas rend un VRAI 404 — et sa fiche est SERVIE.
 *
 * ⚠ CE QUI ÉTAIT FAUX, mesuré le 14 septembre 2026. La fiche auteur portait les
 * DEUX défauts que la fiche notice avait déjà corrigés, et personne ne l'avait
 * regardée depuis :
 *
 *   · `/opac/auteurs/<inexistant>` répondait **200** quand l'API répond 404 ;
 *   · son HTML ne portait que la coque — 65 octets de texte, aucun `<h1>`. Un
 *     moteur d'indexation n'y voyait RIEN, et ces adresses circulent : chaque
 *     notice renvoie vers ses auteurs.
 *
 * ⚠ ET LA MOITIÉ QUI COMPTE AUTANT : une PANNE ne rend pas 404. Déclarer disparu
 * un auteur qu'on n'a pas pu joindre, c'est le dire aux moteurs — et un
 * désindexage se répare en demandant une réindexation, jamais tout seul.
 *
 * ⚠ LE GESTE QUI VIOLERA CE FICHIER : quelqu'un simplifiera `auteurPublic` en
 * « si l'appel échoue, introuvable ». C'est plus court, ça se lit bien, et les
 * trois quarts du temps c'est vrai. Le quart restant est une panne.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Map([['host', 'localhost:3000']]),
}));

const { auteurPublic } = await import('@/lib/server-api');

const AUTEUR = { id: 'a1', displayName: 'Barry, Abdoulaye', worksByRole: [], totalWorks: 0 };

function brancher(reponse: { status: number; corps?: unknown } | 'panne') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      if (reponse === 'panne') return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({
        ok: reponse.status >= 200 && reponse.status < 300,
        status: reponse.status,
        json: () => Promise.resolve(reponse.corps ?? {}),
      } as Response);
    }),
  );
  // La trace d'erreur du module est attendue : on la tait pour ne pas polluer la
  // sortie, jamais pour la supprimer du produit.
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('existence d’un auteur — trois réponses, pas deux', () => {
  it('200 ⇒ il existe, ET son contenu revient', async () => {
    brancher({ status: 200, corps: AUTEUR });
    const { etat, auteur } = await auteurPublic('a1');
    expect(etat).toBe('existe');
    // ⚠ Le contenu compte autant que l'existence : c'est LUI qui est rendu au
    // serveur. Un `etat` juste sur une charge vide rendrait une page sans nom.
    expect((auteur as typeof AUTEUR).displayName).toBe('Barry, Abdoulaye');
  });

  it('404 ⇒ introuvable', async () => {
    brancher({ status: 404 });
    expect((await auteurPublic('a1')).etat).toBe('introuvable');
  });

  it('⚠ 500 ⇒ INDISPONIBLE, jamais introuvable', async () => {
    brancher({ status: 500 });
    expect((await auteurPublic('a1')).etat).toBe('indisponible');
  });

  it('⚠ API injoignable ⇒ INDISPONIBLE, jamais introuvable', async () => {
    brancher('panne');
    expect((await auteurPublic('a1')).etat).toBe('indisponible');
  });

  it('⚠ une panne ne rend JAMAIS de contenu à afficher', async () => {
    // Sinon l'enveloppe rendrait une fiche sans nom : une page qui affirme un
    // contenu qu'elle n'a pas.
    brancher('panne');
    expect((await auteurPublic('a1')).auteur).toBeNull();
    brancher({ status: 500 });
    expect((await auteurPublic('a1')).auteur).toBeNull();
  });

  it('l’identifiant est encodé dans l’URL', async () => {
    brancher({ status: 200, corps: AUTEUR });
    await auteurPublic('a b/c');
    const url = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(url).toContain('a%20b%2Fc');
  });

  it('⚠ l’appel est ANONYME — la vue servie est la vue PUBLIQUE', async () => {
    // Rendre côté serveur avec la session du lecteur publierait dans le HTML ce
    // que le contrôle d'accès réserve aux membres.
    brancher({ status: 200, corps: AUTEUR });
    await auteurPublic('a1');
    const appel = (globalThis.fetch as unknown as {
      mock: { calls: [string, { headers?: Record<string, string> }][] };
    }).mock.calls[0];
    const entetes = Object.keys(appel[1]?.headers ?? {}).map((k) => k.toLowerCase());
    expect(entetes).not.toContain('authorization');
    expect(entetes).not.toContain('cookie');
  });
});
