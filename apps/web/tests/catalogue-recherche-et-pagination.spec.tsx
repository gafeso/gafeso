/**
 * Le catalogue professionnel se cherche et se parcourt — backlog n° 9.
 *
 * ⚠ CE QUE CET ÉCRAN A ÉTÉ. Il n'avait AUCUN champ de saisie : un menu de
 * domaines, et c'est tout. Il demandait cent notices, en annonçait « 352 », et
 * 252 étaient inatteignables — un total exact au-dessus d'une liste incomplète,
 * c'est-à-dire une affirmation vraie qui en laisse croire une fausse.
 *
 * ⚠ ET POURQUOI LA PAGINATION A ATTENDU. L'API triait sur `createdAt` SEUL,
 * sans départage, et 340 des 352 notices du fonds partagent la même seconde.
 * Rejouée en SQL sur les 18 pages, la requête ramenait 20 DOUBLONS et masquait
 * 20 notices — 5,7 % du fonds, en silence. Paginer là-dessus aurait livré le
 * défaut au lieu de le corriger. Le départage livré, la même mesure donne 352
 * ramenées, 352 distinctes, 0 doublon.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CataloguePage from '@/app/admin/catalogue/page';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/catalogue',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

let appels: string[] = [];

function brancher(affichees: number, total: number, totalPages = Math.ceil(total / 20) || 1) {
  appels = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      appels.push(url);
      if (url.includes('/auth/me/functions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ functions: ['catalogue.gerer'] }),
        } as Response);
      }
      if (url.includes('/cataloging/records')) {
        const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? 1);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              total,
              page,
              totalPages,
              records: Array.from({ length: affichees }, (_, i) => ({
                id: `r${page}-${i}`,
                title: `Notice ${page}-${i}`,
                recordType: 'ouvrage',
                category: 'droit',
                publishYear: 2024,
                contributors: [],
                _count: { items: 1 },
              })),
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    }),
  );
}

const derniereListe = () => appels.filter((a) => a.includes('/cataloging/records')).pop() ?? '';

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('la liste est paginée, plus tronquée', () => {
  it('demande vingt notices et dit sa page', async () => {
    brancher(20, 352, 18);
    render(<CataloguePage />);

    expect(await screen.findByText('352 notice(s)')).toBeInTheDocument();
    expect(screen.getByText('Page 1 sur 18')).toBeInTheDocument();
    expect(derniereListe()).toContain('limit=20');
    // ⚠ L'ancienne phrase de troncature n'a plus d'objet : la retrouver ici
    // voudrait dire qu'on annonce un manque qu'on vient de combler.
    expect(screen.queryByText(/affichées sur/)).toBeNull();
  });

  it('la page suivante est demandée à l’API, pas découpée en local', async () => {
    brancher(20, 352, 18);
    render(<CataloguePage />);
    await screen.findByText('Page 1 sur 18');

    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    await waitFor(() => expect(derniereListe()).toContain('page=2'));
  });

  it('une seule page ⇒ aucune commande de pagination', async () => {
    brancher(12, 12, 1);
    render(<CataloguePage />);
    await screen.findByText('12 notice(s)');
    expect(screen.queryByRole('button', { name: 'Page suivante' })).toBeNull();
  });
});

describe('la recherche', () => {
  it('part en `q`, et revient à la première page', async () => {
    brancher(20, 352, 18);
    render(<CataloguePage />);
    await screen.findByText('Page 1 sur 18');

    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    await waitFor(() => expect(derniereListe()).toContain('page=2'));

    fireEvent.change(
      screen.getByLabelText('Rechercher une notice par titre, auteur, ISBN ou éditeur'),
      { target: { value: 'constitutionnel' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher une notice' }));

    // ⚠ Rester en page 2 d'un résultat qui en compte une afficherait une liste
    // vide sur une recherche qui trouve.
    await waitFor(() => expect(derniereListe()).toContain('q=constitutionnel'));
    expect(derniereListe()).toContain('page=1');
  });

  it('⚠ dit que les accents comptent — la limite surprend, donc elle s’écrit', async () => {
    // `ILIKE` ne franchit pas les accents et 268 des 352 titres en portent un :
    // une recherche qui ne trouve pas ce qu'on sait présent fait douter du
    // catalogue, pas de la requête — à moins qu'on ne l'ait prévenu.
    brancher(20, 352, 18);
    render(<CataloguePage />);
    expect(
      await screen.findByText(/« region » ne trouve pas « région »/),
    ).toBeInTheDocument();
  });

  it('⚠ une recherche sans résultat n’est pas un catalogue vide', async () => {
    brancher(20, 352, 18);
    render(<CataloguePage />);
    await screen.findByText('352 notice(s)');

    brancher(0, 0, 1);
    fireEvent.change(
      screen.getByLabelText('Rechercher une notice par titre, auteur, ISBN ou éditeur'),
      { target: { value: 'zzz' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher une notice' }));

    expect(
      await screen.findByText('Aucune notice ne correspond à cette recherche.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucune notice.')).toBeNull();
  });

  it('sans recherche, un catalogue vide se dit vide', async () => {
    // La moitié à ne pas casser : un vrai vide garde sa phrase.
    brancher(0, 0, 1);
    render(<CataloguePage />);
    expect(await screen.findByText('Aucune notice.')).toBeInTheDocument();
    expect(screen.queryByText(/correspond à cette recherche/)).toBeNull();
  });
});
