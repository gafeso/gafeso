/**
 * LA PERTE D'UN DOCUMENT — moitié front, 12 septembre 2026.
 *
 * ⚠ POURQUOI CE GESTE EXISTE, et c'est ce qui décide de tout l'écran. Le seul
 * chemin pour clore un prêt était le RETOUR. Pour un document perdu, il fallait
 * donc déclarer un retour qui n'a pas eu lieu — et ce chemin remet l'exemplaire
 * en circulation, ou le met de côté et prévient le lecteur suivant que son
 * document l'attend au guichet. Le mensonge se propageait jusqu'à quelqu'un qui
 * se déplace pour rien.
 *
 * Les quatre propriétés tenues ici :
 *   1. le geste vit sur la FICHE D'ADHÉRENT — on déclare une perte en regardant
 *      un compte, pas en scannant un code-barres qu'on n'a plus ;
 *   2. la confirmation NOMME le document et dit les DEUX effets — l'exemplaire
 *      sort du fonds, l'amende est figée — parce qu'aucun ne se devine et
 *      qu'aucun ne se défait ;
 *   3. la file devenue non servable est DITE, jamais alarmée, et jamais quand
 *      elle est vide ;
 *   4. rien n'est affirmé sans que l'API l'ait rendu.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FicheAdherent from '@/app/admin/adherents/[id]/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/adherents/p1',
  useParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const BIB = ['document.lire', 'circulation.faire', 'adherents.gerer'];
const TITRE = 'Droit constitutionnel burkinabè';
const CODE = 'BIB-000123';

let appels: string[] = [];

const fiche = {
  id: 'p1',
  firstName: 'Awa',
  lastName: 'Traoré',
  barcode: 'P-2026-0001',
  category: 'etudiant',
  userId: 'u1',
  registrationDate: '2026-09-01T00:00:00.000Z',
  expiryDate: null,
  user: { firstName: 'Awa', lastName: 'Traoré', email: 'a@b.bf' },
  openCheckouts: 1,
  activeHolds: 0,
};

const situation = {
  patron: { id: 'p1', barcode: 'P-2026-0001', category: 'etudiant' },
  checkouts: [
    {
      checkoutId: 'c1',
      title: TITRE,
      itemBarcode: CODE,
      recordId: 'r1',
      dueDate: '2026-09-01T00:00:00.000Z',
      renewals: 0,
      overdue: true,
      accruedFineXof: 450,
    },
  ],
  holds: [],
  fines: { recordedXof: 0, accruingXof: 450 },
};

function brancher(reponsePerte: { reservationsSansExemplaire: number } | 'echec' = {
  reservationsSansExemplaire: 0,
}) {
  appels = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(c) } as Response);
      if (url.includes('/auth/me/functions')) return ok({ functions: BIB });
      if (url.includes('/modules')) return ok([]);
      if (url.includes('/perte')) {
        if (reponsePerte === 'echec') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Erreur',
            json: () => Promise.resolve({ message: 'Erreur' }),
          } as Response);
        }
        return ok({ title: TITRE, ...reponsePerte });
      }
      if (url.includes('/circulation/patrons/p1')) return ok(situation);
      if (url.includes('/patrons/p1/loans')) return ok({ history: { entries: [], total: 0 } });
      if (url.includes('/patrons/p1')) return ok(fiche);
      // ⚠ Un repli silencieux transforme un oubli de doublure en défaut
      // apparent du produit — et on cherche alors dans le code ce qui n'y est pas.
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

const ouvrirLaConfirmation = async () => {
  render(<FicheAdherent />);
  fireEvent.click(await screen.findByRole('button', { name: LIBELLES.perte.declarer }));
};

describe('La perte · le geste vit sur la fiche d’adhérent', () => {
  it('un prêt en cours porte le bouton', async () => {
    brancher();
    render(<FicheAdherent />);
    expect(await screen.findByRole('button', { name: LIBELLES.perte.declarer })).toBeTruthy();
  });

  it('⚠ rien n’est envoyé tant que la confirmation n’est pas donnée', async () => {
    brancher();
    await ouvrirLaConfirmation();
    await screen.findByText(LIBELLES.perte.confirmation(TITRE, CODE));
    expect(appels.some((a) => a.includes('/perte'))).toBe(false);
  });

  it('annuler ferme la confirmation et n’appelle rien', async () => {
    brancher();
    await ouvrirLaConfirmation();
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.adherents.annuler }));
    await waitFor(() =>
      expect(screen.queryByText(LIBELLES.perte.confirmation(TITRE, CODE))).toBeNull(),
    );
    expect(appels.some((a) => a.includes('/perte'))).toBe(false);
  });

  it('confirmer appelle la route, puis RELIT', async () => {
    brancher();
    await ouvrirLaConfirmation();
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.perte.confirmer }));
    await waitFor(() =>
      expect(appels).toContain('POST /api/circulation/checkouts/c1/perte'),
    );
    // ⚠ La relecture fait foi : le prêt disparaît des prêts en cours et
    // l'amende est figée. L'écran ne pose pas cet état lui-même.
    await waitFor(() =>
      expect(appels.filter((a) => a === 'GET /api/patrons/p1').length).toBeGreaterThan(1),
    );
  });
});

describe('La perte · ce que la confirmation DOIT dire', () => {
  it('⚠ elle NOMME le document et son exemplaire', () => {
    // « Êtes-vous sûr ? » ne dit pas lequel — et c'est précisément ce qu'il
    // faut relire avant un geste qui sort un exemplaire du fonds.
    const texte = LIBELLES.perte.confirmation(TITRE, CODE);
    expect(texte).toContain(TITRE);
    expect(texte).toContain(CODE);
  });

  it('⚠ elle dit les DEUX effets, et qu’ils ne se défont pas', () => {
    // Sa propriété, pas sa valeur : « Confirmer la perte ? » serait exact et
    // ne dirait ni que l'exemplaire sort du fonds, ni que l'amende est figée.
    const texte = LIBELLES.perte.confirmation(TITRE, CODE);
    expect(texte).toMatch(/perdu/i);
    expect(texte).toMatch(/plus être prêté|sort du fonds/i);
    expect(texte).toMatch(/amende .*fig|fig.*amende/i);
    expect(texte).toMatch(/ne s’annule pas|irréversible/i);
  });
});

describe('La perte · la file devenue non servable', () => {
  it('⚠ zéro : RIEN ne s’affiche', async () => {
    // Le cas courant — une autre copie existe. « 0 réservation touchée » serait
    // du bruit sur un écran où l'on vient de faire un geste irréversible.
    brancher({ reservationsSansExemplaire: 0 });
    await ouvrirLaConfirmation();
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.perte.confirmer }));
    await screen.findByText(LIBELLES.perte.faite(TITRE));
    expect(screen.queryByText(/réservation/i)).toBeNull();
  });

  it('une seule : la phrase est au singulier', async () => {
    brancher({ reservationsSansExemplaire: 1 });
    await ouvrirLaConfirmation();
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.perte.confirmer }));
    expect(await screen.findByText(LIBELLES.perte.fileNonServable(1))).toBeTruthy();
  });

  it('⚠ elle est DITE, pas alarmée — aucun rôle d’alerte', async () => {
    // Une file non servable n'est pas une anomalie : c'est un état qu'un rachat
    // résout, et la bibliothécaire est seule à pouvoir en décider. Le ton de
    // l'erreur qualifierait de faute le geste qu'on vient de rendre possible.
    brancher({ reservationsSansExemplaire: 3 });
    await ouvrirLaConfirmation();
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.perte.confirmer }));
    const ligne = await screen.findByText(LIBELLES.perte.fileNonServable(3));
    expect(ligne.closest('[role="alert"]')).toBeNull();
  });

  it('⚠ le texte dit que les réservations sont CONSERVÉES', () => {
    // Sa propriété. L'API a tranché « signalées, jamais annulées » : une
    // réservation appartient au lecteur, la lui retirer serait décider à sa
    // place. Sans cette moitié, la phrase se lit comme une annulation.
    for (const n of [1, 3]) {
      expect(LIBELLES.perte.fileNonServable(n)).toMatch(/conservées?/i);
      expect(LIBELLES.perte.fileNonServable(n)).toMatch(/place/i);
    }
  });

  it('⚠ un ÉCHEC ne fait pas croire à une perte déclarée', async () => {
    brancher('echec');
    await ouvrirLaConfirmation();
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.perte.confirmer }));
    await waitFor(() => expect(screen.queryByText(LIBELLES.perte.faite(TITRE))).toBeNull());
    expect(screen.queryByText(/réservation/i)).toBeNull();
  });
});
