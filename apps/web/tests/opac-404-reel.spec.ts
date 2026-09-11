/**
 * Une notice qui n'existe pas rend un VRAI 404 — backlog n° 7.
 *
 * ⚠ CE QUI ÉTAIT FAUX. La fiche publique est un composant client : le 404
 * vivait dans son appel à l'API, jamais dans la réponse HTTP. La page rendait
 * **200** pour un identifiant inexistant. Correct pour l'utilisateur, qui lit
 * « Notice introuvable » — mais indétectable par une machine : un vérificateur
 * de liens morts ou un moteur d'indexation ne distingue pas une notice
 * supprimée d'une notice vivante. Et ces identifiants circulent :
 * `BiblioRecord.id` ne change JAMAIS, il est inscrit dans les licences
 * hors-ligne déjà déployées.
 *
 * ⚠ ET LA MOITIÉ QUI COMPTE AUTANT : une PANNE ne doit pas rendre 404. Déclarer
 * disparue une notice qu'on n'a simplement pas pu joindre, c'est le dire aussi
 * aux moteurs qui indexent. `noticeExiste` rend donc trois réponses, pas deux.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Map([['host', 'localhost:3000']]),
}));

const { noticeExiste } = await import('@/lib/server-api');

function brancher(reponse: { status: number } | 'panne') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      if (reponse === 'panne') return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({
        ok: reponse.status >= 200 && reponse.status < 300,
        status: reponse.status,
        json: () => Promise.resolve({}),
      } as Response);
    }),
  );
  // La trace d'erreur du module est attendue : on la tait pour ne pas polluer
  // la sortie, jamais pour la supprimer du produit.
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('existence d’une notice', () => {
  it('200 ⇒ elle existe', async () => {
    brancher({ status: 200 });
    expect(await noticeExiste('r1')).toBe('existe');
  });

  it('404 ⇒ introuvable — c’est le seul cas qui autorise un 404 de page', async () => {
    brancher({ status: 404 });
    expect(await noticeExiste('r1')).toBe('introuvable');
  });

  it('⚠ 500 ⇒ INDISPONIBLE, jamais introuvable', async () => {
    brancher({ status: 500 });
    expect(await noticeExiste('r1')).toBe('indisponible');
  });

  it('⚠ API injoignable ⇒ INDISPONIBLE, jamais introuvable', async () => {
    // Le cas qui compte : une coupure réseau ne doit pas déclarer disparu tout
    // le catalogue. C'est exactement le défaut « une non-réponse écrite comme
    // un fait », appliqué au code de réponse HTTP.
    brancher('panne');
    expect(await noticeExiste('r1')).toBe('indisponible');
  });

  it('l’identifiant est échappé dans l’URL', async () => {
    // Un identifiant venu de l'URL ne se concatène pas tel quel.
    brancher({ status: 200 });
    await noticeExiste('a b/c');
    const appel = (globalThis.fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(String(appel)).toContain('a%20b%2Fc');
  });
});
