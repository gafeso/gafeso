/**
 * L'ÉCHÉANCE D'UNE MISE DE CÔTÉ — « Mes prêts », 12 septembre 2026.
 *
 * ⚠ « C'EST LE SILENCE QUI COÛTE, PAS L'ÉCHEC. » `GET /reader/holds` sert
 * `expiryDate` depuis toujours — il était même dans le TYPE du front — et
 * l'écran ne l'affichait pas. Le lecteur lisait « Disponible — à retirer », sans
 * aucune date.
 *
 * Ce qui rend ce silence coûteux n'est pas l'oubli lui-même : c'est qu'il se
 * cumule avec un autre. Le courriel qui annonce une mise de côté peut échouer
 * SANS BRUIT — défaut mesuré côté API, pas hypothèse. Un lecteur non prévenu ne
 * sait alors ni qu'un document l'attend, ni qu'il va le perdre. Cet écran est
 * son seul recours, et il se taisait sur la moitié qui compte.
 *
 * ⚠ Sa famille : c'est une colonne SERVIE que personne n'affiche — le miroir
 * d'« une colonne sans écrivain », et le même aveuglement. Tout dit qu'elle
 * existe ; rien ne dit que personne ne la montre.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageMesPrets from '@/app/mes-prets/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/mes-prets',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.reservations;

const hold = (extra: Record<string, unknown> = {}) => ({
  holdId: 'h1',
  recordId: 'r1',
  title: 'Droit constitutionnel burkinabè',
  status: 'AVAILABLE',
  position: 0,
  expiryDate: '2026-09-20T00:00:00.000Z',
  ...extra,
});

function brancher(holds: unknown[]) {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(c) } as Response);
      if (url.includes('/auth/me/functions')) return ok({ functions: ['document.lire'] });
      if (url.includes('/reader/holds')) return ok({ hasCard: true, holds });
      if (url.includes('/reader/loans'))
        return ok({
          hasCard: true,
          current: [],
          history: { entries: [], total: 0, page: 1, totalPages: 1 },
          counters: { current: 0, overdue: 0 },
        });
      if (url.includes('/modules')) return ok([]);
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Mise de côté · l’échéance est dite', () => {
  it('⚠ un document mis de côté annonce SA DATE LIMITE', async () => {
    brancher([hold()]);
    render(<PageMesPrets />);
    expect(await screen.findByText(new RegExp(T.aRetirerAvant('20 septembre 2026')))).toBeTruthy();
  });

  it('⚠ et ce qui arrive si on ne vient pas — sinon la date n’est qu’un chiffre', async () => {
    brancher([hold()]);
    render(<PageMesPrets />);
    expect(await screen.findByText(new RegExp(T.apresEcheance))).toBeTruthy();
  });

  it('⚠ sans date servie, on n’INVENTE pas d’échéance', async () => {
    // Trois états, pas deux. Une date devinée sur cet écran ferait venir
    // quelqu'un trop tard, ou renoncer trop tôt.
    brancher([hold({ expiryDate: null })]);
    render(<PageMesPrets />);
    await screen.findByText('Droit constitutionnel burkinabè');
    expect(screen.queryByText(new RegExp(T.apresEcheance))).toBeNull();
  });

  it('une réservation EN FILE n’a pas d’échéance à montrer', async () => {
    // Elle n'est pas mise de côté : rien ne l'attend au comptoir, donc rien
    // n'expire. Afficher une date ici serait un avertissement sans objet.
    brancher([hold({ status: 'PENDING', position: 3, expiryDate: null })]);
    render(<PageMesPrets />);
    expect(await screen.findByText(/position 3/)).toBeTruthy();
    expect(screen.queryByText(new RegExp(T.apresEcheance))).toBeNull();
  });
});

describe('Mise de côté · ce que le texte DOIT dire', () => {
  it('⚠ il dit la CONSÉQUENCE, pas seulement la date', () => {
    // Sa propriété, pas sa valeur. « Expire le 20 septembre » serait exact et
    // ne dirait pas ce qu'on perd — ni que quelqu'un d'autre l'attend.
    expect(LIBELLES.reservations.apresEcheance).toMatch(/repart|suivante/i);
    expect(LIBELLES.reservations.aRetirerAvant('X')).toMatch(/retirer/i);
  });
});
