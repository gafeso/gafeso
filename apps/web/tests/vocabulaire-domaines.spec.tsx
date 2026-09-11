/**
 * « Catégories » est devenu « Domaines » — partout où l'utilisateur lit.
 *
 * Le renommage a d'abord été fait dans la seule navigation, et l'écran de
 * catalogage continuait d'afficher une colonne « CATÉGORIE » et un filtre
 * « Toutes les catégories ». Constaté sur une capture à 375 px, pas par
 * relecture : c'est le genre d'incohérence qu'on cesse de voir dans son propre
 * diff. Ce test la rend impossible à réintroduire en silence.
 *
 * ⚠ Ce qui NE doit PAS changer : la route /admin/categories, le paramètre
 * d'API `category` et la valeur `categorie` du sélecteur de recherche OPAC.
 * Renommer une route casserait les liens en circulation ; renommer une valeur
 * casserait l'appel. Le mot change, le contrat non.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CataloguePage from '@/app/admin/catalogue/page';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/catalogue',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const DOMAINES = [{ id: 'c1', name: 'droit' }];

function brancherFetch() {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      const corps = url.includes('/cataloging/records')
        ? { total: 0, page: 1, totalPages: 1, records: [] }
        : url.includes('/categories')
          ? DOMAINES
          : url.includes('/auth/me/functions')
            ? { functions: ['catalogue.gerer'] }
            : [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('vocabulaire de l’écran de catalogage', () => {
  it('ne parle plus de « catégorie » à l’utilisateur', async () => {
    brancherFetch();
    const { container } = render(<CataloguePage />);
    await screen.findByRole('heading', { name: 'Catalogue' });

    // Tout ce que l'utilisateur LIT : texte affiché, libellés accessibles,
    // titres et textes de remplacement. Pas les valeurs, pas les href.
    const lu = [
      container.textContent ?? '',
      ...[...container.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) => [
        el.getAttribute('aria-label') ?? '',
        el.getAttribute('title') ?? '',
        el.getAttribute('placeholder') ?? '',
      ]),
    ].join(' ');

    expect(lu).not.toMatch(/catégorie/i);
    expect(lu).toContain('Domaine');
  });

  it('nomme la colonne et le filtre « domaine »', async () => {
    brancherFetch();
    render(<CataloguePage />);
    await screen.findByRole('heading', { name: 'Catalogue' });

    expect(screen.getByRole('columnheader', { name: 'Domaine' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tous les domaines' })).toBeInTheDocument();
  });

  it('garde la ROUTE et le PARAMÈTRE d’API inchangés', async () => {
    brancherFetch();
    const { container } = render(<CataloguePage />);
    await screen.findByRole('heading', { name: 'Catalogue' });

    // Le mot change à l'écran ; le contrat, lui, ne bouge pas — sinon les
    // liens en circulation cassent et l'appel échoue.
    const filtre = container.querySelector('select[aria-label="Filtrer par domaine"]');
    expect(filtre, 'le filtre a changé de libellé accessible').toBeTruthy();
    const appels = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(appels.some((u) => u.includes('/categories'))).toBe(true);
  });
});
