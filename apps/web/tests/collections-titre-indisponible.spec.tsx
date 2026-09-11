/**
 * Le titre d'un document de collection : trois états, pas deux.
 *
 * ⚠ CE QUI A CHANGÉ SOUS L'ÉCRAN. `GET /cataloging/records/:id` était ouverte à
 * tout compte authentifié ; le backend l'a fermée le 11 septembre 2026 et elle
 * exige désormais `catalogue.gerer`. Or cet écran est gardé par
 * `collections.gerer`. Un rôle portant l'une sans l'autre — ce que la maquette
 * prévoit pour le Bibliothécaire — reçoit un 403 en allant chercher le titre.
 *
 * ⚠ LE DÉFAUT N'EST PAS LE 403, C'EST LE SILENCE. L'écriture précédente rendait
 * `null` pendant le chargement ET en cas d'échec, et l'appelant affichait « … »
 * pour les deux. Une panne s'écrivait donc exactement comme une attente, et les
 * points de suspension restaient là pour toujours — un vide muet de plus, sur
 * une ligne où le bibliothécaire attend un titre.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CollectionDetailPage from '@/app/admin/collections/[id]/page';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c1' }),
  usePathname: () => '/admin/collections/c1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** @param titre 'ok' | 'refus' (403) | 'jamais' (promesse en attente) */
function brancher(titre: 'ok' | 'refus' | 'jamais') {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/auth/me/functions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ functions: ['collections.gerer'] }),
        } as Response);
      }
      // ⚠ Le titre AVANT la collection : `/collections/documents/r1` contient
      // « /collections/ », donc l'ordre décide. Des clés précises éviteraient le
      // piège, cet ordre explicite le referme aussi sûrement.
      if (url.includes('/collections/documents/')) {
        if (titre === 'jamais') return new Promise(() => {});
        if (titre === 'refus') {
          return Promise.resolve({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            json: () => Promise.resolve({ message: 'Interdit.' }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'r1', title: 'Droit constitutionnel' }),
        } as Response);
      }
      if (url.includes('/access-rules')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      }
      if (url.includes('/collections/c1')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'c1',
              name: 'Fonds de droit',
              description: null,
              type: 'INTERNAL',
              // Un document LOCAL : pas de `title` embarqué, seulement un id.
              // C'est le seul cas qui déclenche l'appel au titre.
              titles: [{ id: 't1', titleId: null, recordId: 'r1', title: null }],
            }),
        } as Response);
      }
      if (url.includes('/collections/rule-options')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ classes: [], tiers: [] }),
        } as Response);
      }
      // ⚠ TOUT CE QUI N'EST PAS NOMMÉ ÉCHOUE BRUYAMMENT. Un repli discret qui
      // rendait `[]` pour toute URL inconnue a fait rendre un tableau là où
      // l'écran attendait `{ classes, tiers }` : la page a cassé, et le test a
      // échoué en disant « élément introuvable » — jamais « votre doublure a
      // répondu n'importe quoi ». Une doublure qui répond à la place d'une
      // autre fait échouer le test pour une raison qui n'est pas la bonne.
      throw new Error(`Doublure : requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('⚠ un échec de titre se DIT', () => {
  it('403 sur le titre : « Titre indisponible », jamais des points de suspension', async () => {
    // Le 403 ne vient plus de `catalogue.gerer` — la route dédiée est derrière
    // `collections.gerer`. Le cas reste exercé : une panne, un droit retiré en
    // cours de session, une notice supprimée entre-temps.
    brancher('refus');
    render(<CollectionDetailPage />);

    expect(await screen.findByText('Titre indisponible')).toBeInTheDocument();
    // Le point du lot : l'attente et la panne ne s'écrivent plus pareil.
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('tant que la réponse n’arrive pas, l’écran dit qu’il charge', async () => {
    brancher('jamais');
    render(<CollectionDetailPage />);

    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    // Et surtout PAS l'inverse : une attente n'est pas une panne.
    expect(screen.queryByText('Titre indisponible')).toBeNull();
  });
});

describe('le chemin nominal est intact', () => {
  it('le titre obtenu s’affiche, avec son auteur', async () => {
    brancher('ok');
    render(<CollectionDetailPage />);

    expect(await screen.findByText('Droit constitutionnel')).toBeInTheDocument();
    expect(screen.queryByText('Titre indisponible')).toBeNull();
    expect(screen.queryByText('Chargement…')).toBeNull();
  });
});
