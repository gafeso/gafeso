/**
 * ⚠ « VUS » EST LA SEULE CATÉGORIE QUE LE RAPPORT NE MONTRAIT PAS.
 *
 * L'API sert les quatre listes, le type du front les déclare toutes les
 * quatre — `seen: ItemInfo[]` compris — et l'écran rendait une table pour
 * `missing`, `unexpected` et `onLoan`. De `seen`, il n'affichait que le COMPTE,
 * dans une tuile verte.
 *
 * ⚠ CE QUE ÇA COÛTAIT. Une bibliothécaire qui veut vérifier qu'un exemplaire
 * précis a bien été scanné ne pouvait que constater son absence de
 * « Manquants ». Ce n'est PAS la même chose quand le périmètre est partiel :
 * une session sur une salle n'attend pas tout le fonds, et un exemplaire d'une
 * autre salle n'est ni vu, ni manquant — il est hors périmètre.
 *
 * ⚠ ET CE N'EST PAS UN CHOIX DE CHARGE : `GET /report` transporte DÉJÀ la
 * liste. L'afficher n'ajoute aucun octet. La réduction viendra du chemin paginé
 * (`counts` + `items/:categorie`), qui attend d'être poussé côté backend — la
 * passation du 22 septembre le dit, et le lot est prêt de côté.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

const T = LIBELLES.rapportRecolement;
const ID = 'sess-1';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: ID }),
  usePathname: () => `/admin/recolement/${ID}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/functions', () => ({
  useMyFunctions: () => ({ functions: ['outils.catalogue'] }),
}));

import RecolementSessionPage from '@/app/admin/recolement/[id]/page';

const SESSION = {
  id: ID,
  label: 'Salle de lecture',
  scope: 'ALL',
  scopeValue: null,
  status: 'OPEN',
  startedAt: '2026-09-22T08:00:00Z',
  closedAt: null,
  location: null,
  progress: { expected: 4, scanned: 2, totalScans: 3 },
};

const item = (n: number) => ({
  id: `i${n}`,
  barcode: `BIB-${n}`,
  callNumber: `COTE ${n}`,
  title: `Titre ${n}`,
  status: 'AVAILABLE',
});

const RAPPORT = {
  counts: { seen: 2, missing: 1, onLoan: 1, unexpected: 1, expected: 4 },
  seen: [item(1), item(2)],
  missing: [item(3)],
  onLoan: [item(4)],
  unexpected: [{ barcode: 'XX-9', result: 'UNKNOWN' }],
};

function brancher(rapport: unknown = RAPPORT) {
  ouvrirSession();
  vi.stubGlobal('fetch', (entree: RequestInfo | URL) => {
    const url = String(entree);
    const ok = (corps: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) } as Response);
    if (url.includes('/report')) return ok(rapport);
    if (url.includes(`/inventory/sessions/${ID}`)) return ok(SESSION);
    // Une doublure qui se tait transforme un oubli en défaut apparent.
    return Promise.reject(new Error(`requête non couverte — ${url}`));
  });
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('🔴 la catégorie « Vus » s’affiche comme les trois autres', () => {
  it('sa table est là, avec ses lignes', async () => {
    brancher();
    render(<RecolementSessionPage />);
    expect(await screen.findByText(T.vus)).toBeTruthy();
    // ⚠ L'assertion qui porte le lot : les CODES-BARRES vus, pas seulement leur
    // nombre. C'est ce qu'on vient chercher — « BIB-2 a-t-il été scanné ? ».
    expect(await screen.findByText('BIB-1')).toBeTruthy();
    expect(screen.getByText('BIB-2')).toBeTruthy();
  });

  it('les quatre catégories sont montrées, plus seulement trois', async () => {
    brancher();
    render(<RecolementSessionPage />);
    for (const titre of [T.vus, T.manquants, T.enPret, T.inattendus]) {
      expect(await screen.findByText(titre)).toBeTruthy();
    }
  });

  it('⚠ une catégorie vide ne montre pas de table vide', async () => {
    brancher({ ...RAPPORT, counts: { ...RAPPORT.counts, seen: 0 }, seen: [] });
    render(<RecolementSessionPage />);
    await screen.findByText(T.manquants);
    expect(screen.queryByText(T.vus)).toBeNull();
  });

  it('le COMPTE reste affiché — il ne remplace pas la liste, il la résume', async () => {
    brancher();
    render(<RecolementSessionPage />);
    await waitFor(() => expect(screen.getByText('Vus')).toBeTruthy());
    // La tuile « Vus » et la table « Vus (scannés, dans le périmètre) » sont
    // deux choses : l'une se lit d'un coup d'œil, l'autre se cherche.
    expect(screen.getByText(T.vus)).toBeTruthy();
  });
});

describe('Les titres des quatre catégories disent ce qu’elles CONTIENNENT', () => {
  it('chacun nomme son critère, pas seulement son étiquette', () => {
    // Un titre « Vus » seul laisse croire « vus dans toute la bibliothèque ».
    // Le périmètre d'une session peut être une salle : le titre doit le dire.
    expect(T.vus).toMatch(/périmètre/i);
    expect(T.manquants).toMatch(/attendus/i);
    expect(T.enPret).toMatch(/légitimes/i);
    expect(T.inattendus).toMatch(/hors périmètre|inconnus/i);
  });
});
