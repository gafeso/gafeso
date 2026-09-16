/**
 * ⚠ ROUVRIR UNE SESSION CLÔTURÉE PAR ERREUR — la deuxième porte manquante.
 *
 * *Relevée par le backend, posée le 16 septembre 2026.* L'API l'écrit :
 * « sans elle, un clic coûtait le récolement entier — `scan` refuse sur une
 * session close en disant "rouvrez-en une NOUVELLE", c'est-à-dire recommencer
 * sur plusieurs milliers d'exemplaires ».
 *
 * ⚠ TROIS ÉTATS, PAS DEUX — et c'est ce que ce fichier garde vraiment.
 * L'écran n'en connaissait que deux : ouverte, ou « Clôturée ». La base en
 * porte TROIS, et le troisième (`APPLIED`) existe PRÉCISÉMENT pour que
 * « rouvrir » puisse refuser : une session dont on a marqué les manquants a
 * CHANGÉ LE CATALOGUE — des exemplaires sont passés en `MISSING`.
 *
 * Les confondre aurait donné un bouton dont la SEULE issue est un refus, sur
 * l'écran d'une bibliothécaire qui vient de perdre des jours de scan. C'est
 * « pas de bouton sans effet », appliqué à un état que le front ignorait.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecolementSessionPage from '@/app/admin/recolement/[id]/page';
import { LIBELLES } from '@/lib/libelles';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 's1' }),
  usePathname: () => '/admin/recolement/s1',
  useRouter: () => routeur,
}));
const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton', getUser: () => ({ id: 'u1' }) }));

const T = LIBELLES.recolement;

const RAPPORT = {
  counts: { seen: 40, missing: 3, onLoan: 1, unexpected: 0, expected: 44 },
  seen: [],
  missing: [{ id: 'i9', barcode: 'BIB-000999', title: 'Manquant', callNumber: null, location: null, status: 'AVAILABLE' }],
  onLoan: [],
  unexpected: [],
};

let appels: { url: string; method: string }[] = [];
let refusReouverture: { statut: number; message: string } | null = null;

function brancher(statut: string) {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      const method = init?.method ?? 'GET';
      appels.push({ url, method });
      const ok = (corps: unknown) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as Response);

      if (url.includes('/reopen')) {
        if (refusReouverture) {
          return Promise.resolve({
            ok: false,
            status: refusReouverture.statut,
            json: () => Promise.resolve({ message: refusReouverture!.message }),
          } as Response);
        }
        return ok({ id: 's1', status: 'OPEN' });
      }
      if (url.includes('/report')) return ok(RAPPORT);
      if (url.includes('/sessions/s1')) {
        return ok({
          id: 's1',
          name: 'Salle de lecture — septembre',
          scope: 'LOCATION',
          location: 'Salle de lecture',
          status: statut,
          progress: { expected: 44, scanned: 40, totalScans: 41 },
        });
      }
      // ⚠ JAMAIS de repli silencieux.
      return Promise.reject(new Error(`requête non couverte — ${method} ${url}`));
    }),
  );
}

async function monter(statut: string) {
  brancher(statut);
  render(<RecolementSessionPage />);
  await waitFor(() => expect(screen.getByText('Salle de lecture — septembre')).toBeTruthy());
}

const boutonRouvrir = () => screen.queryByRole('button', { name: T.rouvrir });

beforeEach(() => {
  refusReouverture = null;
});
afterEach(() => vi.unstubAllGlobals());

describe('⚠ la porte ne s’ouvre que là où elle mène quelque part', () => {
  it('session CLÔTURÉE : le bouton est là', async () => {
    await monter('CLOSED');
    expect(boutonRouvrir()).toBeTruthy();
  });

  it('⚠ session APPLIQUÉE : PAS de bouton — sa seule issue serait un refus', async () => {
    await monter('APPLIED');
    expect(
      boutonRouvrir(),
      'un bouton dont la seule issue est un refus se lit comme une panne',
    ).toBeNull();
  });

  it('⚠ et la PHRASE prend sa place, à l’endroit où on le cherchait', async () => {
    // Un bouton retiré sans explication laisse chercher ce qui n'existe pas.
    await monter('APPLIED');
    expect(screen.getByText(T.dejaAppliquee)).toBeTruthy();
  });

  it('session OUVERTE : ni bouton ni phrase — il n’y a rien à rouvrir', async () => {
    await monter('OPEN');
    expect(boutonRouvrir()).toBeNull();
    expect(screen.queryByText(T.dejaAppliquee)).toBeNull();
  });
});

describe('les trois états sont NOMMÉS, et distinctement', () => {
  it('ouverte', async () => {
    await monter('OPEN');
    expect(screen.getByText(new RegExp(T.etatEnCours))).toBeTruthy();
  });

  it('clôturée', async () => {
    await monter('CLOSED');
    expect(screen.getByText(new RegExp(T.etatCloturee))).toBeTruthy();
  });

  it('⚠ appliquée : elle ne se lit PAS « Clôturée » tout court', async () => {
    // C'est la confusion qui a produit le défaut : deux états distincts qui
    // s'affichaient du même mot, donc un geste offert là où il est refusé.
    await monter('APPLIED');
    expect(screen.getByText(new RegExp(T.etatAppliquee))).toBeTruthy();
    expect(T.etatAppliquee).not.toBe(T.etatCloturee);
  });
});

describe('quand on rouvre', () => {
  it('⚠ l’appel part en POST sur /reopen', async () => {
    await monter('CLOSED');
    fireEvent.click(boutonRouvrir()!);
    await waitFor(() => {
      const envoi = appels.find((a) => a.url.includes('/reopen'));
      expect(envoi, 'aucun appel à /reopen').toBeTruthy();
      expect(envoi!.method).toBe('POST');
    });
  });

  it('⚠ la session ET le rapport sont rechargés', async () => {
    // Rouvrir change l'état ET ce que le rapport signifie : une session close
    // n'accepte plus de scan, rouverte si. Laisser l'un des deux en place
    // ferait dire à l'écran l'inverse de ce qui vient de se passer.
    await monter('CLOSED');
    const avant = appels.filter((a) => a.url.includes('/report')).length;
    fireEvent.click(boutonRouvrir()!);
    await waitFor(() =>
      expect(appels.filter((a) => a.url.includes('/report')).length).toBeGreaterThan(avant),
    );
  });

  it('l’écran dit que c’est rouvert, et qu’on peut reprendre', async () => {
    await monter('CLOSED');
    fireEvent.click(boutonRouvrir()!);
    await waitFor(() => expect(screen.getByText(T.rouverte)).toBeTruthy());
  });

  it('⚠ refus de l’API : c’est SON message qui s’affiche', async () => {
    // Le refus est précis et long — « le catalogue a été modifié, ouvrez une
    // nouvelle session ». En écrire un plus court perdrait la raison.
    refusReouverture = {
      statut: 409,
      message:
        'Les manquants de cette session ont déjà été marqués : le catalogue a été modifié.',
    };
    await monter('CLOSED');
    fireEvent.click(boutonRouvrir()!);
    await waitFor(() =>
      expect(screen.getByText(/le catalogue a été modifié/)).toBeTruthy(),
    );
  });
});

describe('⚠ ce que les textes DOIVENT dire', () => {
  it('« rouvrir » dit ce qu’on REPREND, pas ce que le bouton fait', () => {
    expect(T.rouvrirPourquoi).toMatch(/rescanner|là où/i);
  });

  it('« déjà appliquée » nomme la CAUSE et donne la SORTIE', () => {
    // Sans la cause, le refus est arbitraire. Sans la sortie, la personne
    // reste devant un écran qui dit non et rien d'autre.
    expect(T.dejaAppliquee, 'la cause : le catalogue a changé').toMatch(/catalogue/i);
    expect(T.dejaAppliquee, 'la sortie : une nouvelle session').toMatch(/nouvelle session/i);
  });
});
