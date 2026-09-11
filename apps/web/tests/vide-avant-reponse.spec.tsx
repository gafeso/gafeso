/**
 * Un écran n'affirme pas le vide avant d'avoir la réponse.
 *
 * ⚠ Le défaut, mesuré le 10 septembre 2026 en session bibliothécaire :
 * /admin/auteurs écrivait « Aucun auteur. » à l'instant du rendu, puis
 * affichait 200 lignes 250 ms plus tard. Le fichier d'autorités en contenait
 * 278 depuis le début. La cause : `useState<AuthorRow[]>([])` — un tableau vide
 * ne distingue pas « pas encore chargé » de « il n'y en a aucun ».
 *
 * C'est la faute déjà documentée dans CLAUDE.md — une non-réponse écrite comme
 * un fait — et c'est aussi celle que /admin/catalogue avait corrigée le
 * 8 septembre. Le remède existait dans le dépôt ; il n'avait pas été répliqué.
 *
 * ⚠ EN LOCAL LE DÉFAUT DURE 250 ms. C'est pourquoi il a survécu : personne ne
 * lit un écran à l'instant zéro. Sur le réseau d'un campus, il se lit. Le test
 * l'exerce donc dans le CAS DÉGRADÉ — une réponse qui n'arrive jamais — parce
 * que c'est le seul où la faute est visible.
 *
 * ⚠ Et la moitié à ne pas casser : un vrai vide doit RESTER un vide. Un écran
 * qui ne dirait plus jamais « aucun » remplacerait un mensonge par un silence.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AuteursPage from '@/app/admin/auteurs/page';
import RecolementPage from '@/app/admin/recolement/page';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * @param donnees corps de la liste, ou 'jamais' pour une réponse qui n'arrive
 *                pas — l'état où la faute est visible.
 */
function brancher(donnees: Record<string, unknown> | 'jamais') {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      // Les fonctions doivent répondre : sans elles l'écran affiche son refus
      // et le test ne regarderait rien du tout.
      if (url.includes('/auth/me/functions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ functions: ['catalogue.gerer', 'outils.catalogue'] }),
        } as Response);
      }
      if (donnees === 'jamais') return new Promise(() => {});
      return Promise.resolve({ ok: true, json: () => Promise.resolve(donnees) } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
});

describe('⚠ tant que la réponse n’est pas là, l’écran ne dit pas « aucun »', () => {
  it('/admin/auteurs : dit qu’il charge, PAS qu’il n’y a aucun auteur', async () => {
    brancher('jamais');
    render(<AuteursPage />);

    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    expect(screen.queryByText('Aucun auteur.')).toBeNull();
  });

  it('/admin/recolement : même chose', async () => {
    brancher('jamais');
    render(<RecolementPage />);

    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    expect(screen.queryByText('Aucune session de récolement.')).toBeNull();
  });
});

describe('⚠ un vrai vide reste un vide', () => {
  it('/admin/auteurs : le fichier d’autorités vide se DIT vide', async () => {
    // Sans ce contre-témoin, la correction aurait pu supprimer le message tout
    // court — un mensonge remplacé par un silence.
    brancher({ authors: [] });
    render(<AuteursPage />);

    expect(await screen.findByText('Aucun auteur.')).toBeInTheDocument();
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('/admin/auteurs : et une liste pleine affiche ses lignes', async () => {
    brancher({
      authors: [{ id: 'a1', displayName: 'Ouoba, Justine', workCount: 2 }],
    });
    render(<AuteursPage />);

    await waitFor(() => expect(screen.getByText('Ouoba, Justine')).toBeInTheDocument());
    expect(screen.queryByText('Aucun auteur.')).toBeNull();
    expect(screen.queryByText('Chargement…')).toBeNull();
  });
});
