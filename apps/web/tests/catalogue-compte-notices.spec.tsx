/**
 * Le compte de notices ne ment pas sur un chargement qui n'a pas abouti.
 *
 * `{data?.total ?? 0}` faisait écrire « 0 notice(s) » dans TROIS situations
 * distinctes : le catalogue est vide, le chargement est en cours, le
 * chargement a échoué. Les deux dernières sont des non-réponses, et l'écran
 * les présentait comme un fait — un zéro, chiffré, rassurant, et faux.
 *
 * C'est le même motif que le descripteur qui affichait le slug faute de mieux :
 * un écran qui n'a rien à dire dit quelque chose plutôt que de se taire.
 *
 * ⚠ Un vrai zéro doit rester un zéro : le test le vérifie aussi, sans quoi la
 * correction remplacerait un mensonge par un silence.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CataloguePage from '@/app/admin/catalogue/page';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/catalogue',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** @param notices nombre de notices, ou 'echec', ou 'jamais' (promesse en attente) */
function brancherFetch(notices: number | 'echec' | 'jamais') {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/cataloging/records')) {
        if (notices === 'jamais') return new Promise(() => {}); // ne se résout jamais
        if (notices === 'echec') {
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            json: () => Promise.resolve({ message: 'Service indisponible.' }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              total: notices,
              page: 1,
              totalPages: 1,
              records: Array.from({ length: notices }, (_, i) => ({
                id: `r${i}`,
                title: `Notice ${i}`,
                titleComplement: null,
                author: null,
                contributors: [],
                category: null,
                recordType: 'ouvrage',
                publishYear: null,
                _count: { items: 0 },
              })),
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('ligne de compte des notices', () => {
  it('pendant le chargement : ne dit AUCUN nombre', async () => {
    brancherFetch('jamais');
    const { container } = render(<CataloguePage />);
    await screen.findByRole('heading', { name: 'Catalogue' });

    expect(screen.getByText(/Chargement du catalogue/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+\s*notice\(s\)/);
  });

  it('en échec : dit l’échec, jamais « 0 notice(s) »', async () => {
    brancherFetch('echec');
    const { container } = render(<CataloguePage />);
    await waitFor(() =>
      expect(screen.getByText(/Nombre de notices indisponible/)).toBeInTheDocument(),
    );
    // LE cœur du lot : un chargement raté ne s'écrit pas comme un catalogue vide.
    expect(container.textContent).not.toMatch(/0 notice\(s\)/);
  });

  it('catalogue réellement vide : dit bien « 0 notice(s) »', async () => {
    // Contrôle inverse : la correction ne doit pas transformer un vrai zéro en
    // silence, sinon on aurait remplacé un mensonge par une omission.
    brancherFetch(0);
    render(<CataloguePage />);
    await waitFor(() => expect(screen.getByText('0 notice(s)')).toBeInTheDocument());
    expect(screen.getByText('Aucune notice.')).toBeInTheDocument();
  });

  it('catalogue chargé : dit le nombre réel', async () => {
    brancherFetch(12);
    render(<CataloguePage />);
    await waitFor(() => expect(screen.getByText('12 notice(s)')).toBeInTheDocument());
  });
});
