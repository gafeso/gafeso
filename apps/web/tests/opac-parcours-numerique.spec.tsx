/**
 * « Documents numériques » : un PARCOURS, pas un filtre de recherche.
 *
 * Le groupe manquait à la page d'accueil parce que `avecFichier` se lit EN
 * BASE : /opac/search ne peut pas le porter sans que ses totaux deviennent
 * faux. L'API l'a donc sorti sur une route à part, /opac/parcourir. Le glisser
 * dans le menu déroulant de la recherche aurait promis une recherche
 * restreinte aux documents numériques — que rien ne sait servir.
 *
 * ⚠ Ce que ce test défend, ce n'est pas l'affichage : c'est que le mode
 * parcours appelle la BONNE ROUTE, qu'il en sort, qu'il pagine, et qu'un
 * parcours vide ne se dise pas « aucune notice ne correspond » — rien n'a été
 * cherché.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OpacPage from '@/app/opac/page';

let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => parametres,
  usePathname: () => '/opac',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

let appels: string[] = [];

function brancherApi(total: number, parPage = 20) {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      appels.push(url);
      const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? 1);
      const restant = Math.max(0, Math.min(parPage, total - (page - 1) * parPage));
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            // ⚠ La forme RÉELLE de /opac/parcourir : ni facettes, ni catégorie,
            // ni langue. Un faux qui les rendrait quand même ne prouverait rien.
            hits: Array.from({ length: restant }, (_, i) => ({
              id: `n-${page}-${i}`,
              title: `Document ${page}-${i}`,
              author: 'Ouédraogo, Awa',
              publishYear: 2024,
              recordType: 'these',
              coverUrl: null,
            })),
            totalHits: total,
            page,
            totalPages: Math.ceil(total / parPage),
          }),
      } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  parametres = new URLSearchParams();
});

describe('le parcours appelle la route qui sait le servir', () => {
  it('⚠ /opac/parcourir avec avecFichier, JAMAIS /opac/search', async () => {
    parametres = new URLSearchParams('numeriques=1');
    brancherApi(154);
    render(<OpacPage />);

    await waitFor(() => expect(appels.length).toBe(1));
    expect(appels[0]).toContain('/opac/parcourir');
    expect(appels[0]).toContain('avecFichier=true');
    // La preuve qui compte : la recherche n'est pas appelée en plus. Elle
    // renverrait un total calculé sans le filtre, donc faux.
    expect(appels.some((u) => u.includes('/opac/search'))).toBe(false);
    expect(await screen.findByText('154 résultats')).toBeInTheDocument();
  });

  it('sans le paramètre, c’est la recherche normale', async () => {
    brancherApi(352);
    render(<OpacPage />);

    await waitFor(() => expect(appels.length).toBe(1));
    expect(appels[0]).toContain('/opac/search');
    expect(appels[0]).not.toContain('parcourir');
  });
});

describe('⚠ le parcours n’est pas un cul-de-sac non plus', () => {
  it('offre d’en sortir, vers la recherche', async () => {
    parametres = new URLSearchParams('numeriques=1');
    brancherApi(154);
    render(<OpacPage />);

    const sortie = await screen.findByRole('link', { name: 'Quitter le parcours' });
    expect(sortie).toHaveAttribute('href', '/opac');
  });

  it('pagine : 154 documents ne s’arrêtent pas à 20 en silence', async () => {
    parametres = new URLSearchParams('numeriques=1');
    brancherApi(154);
    render(<OpacPage />);

    await screen.findByText('Page 1 sur 8');
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));

    await waitFor(() => expect(appels.length).toBe(2));
    expect(appels[1]).toContain('page=2');
    expect(await screen.findByText('Page 2 sur 8')).toBeInTheDocument();
  });

  it('une seule page ⇒ aucune commande de pagination', async () => {
    // Refus d'inertie : deux boutons qui ne mènent nulle part.
    parametres = new URLSearchParams('numeriques=1');
    brancherApi(12);
    render(<OpacPage />);

    await screen.findByText('12 résultats');
    expect(screen.queryByRole('button', { name: 'Page suivante' })).toBeNull();
  });
});

describe('⚠ un parcours vide ne parle pas de recherche', () => {
  it('dit que le FONDS n’en contient pas, pas que la requête n’a rien trouvé', async () => {
    parametres = new URLSearchParams('numeriques=1');
    brancherApi(0);
    render(<OpacPage />);

    await screen.findByText('Aucun document numérique dans ce catalogue pour l’instant.');
    expect(screen.queryByText('Aucune notice ne correspond à cette recherche.')).toBeNull();
  });
});
