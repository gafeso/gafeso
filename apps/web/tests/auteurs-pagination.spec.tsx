/**
 * L'index des auteurs parcourt ses 557 fiches — et il a fallu trois états.
 *
 * ⚠ CE QUE LA MESURE A TROUVÉ. `GET /authors` rend 200 auteurs par page. L'écran
 * ne lisait que `authors` : il en affichait 200 sans compteur et sans un mot —
 * 200 sur 557 pour le fonds d'échelle, et **200 sur 278 pour l'école de
 * démonstration**, c'est-à-dire depuis toujours. Il a fallu huit mille notices
 * pour qu'on aille regarder un défaut qui tenait à deux cent soixante-dix-huit
 * auteurs.
 *
 * ⚠ PUIS MA CORRECTION A ÉTÉ PIRE QUE LE DÉFAUT. La réponse portait `totalPages`
 * — j'en ai conclu une route paginée et envoyé `page=1`. Elle le REFUSAIT :
 * `400, property page should not exist`, et l'écran a affiché ce message à la
 * place de la liste. Le code compilait, la suite passait : une doublure répond
 * ce qu'on lui dit de répondre, elle ne peut pas démentir un contrat mal lu.
 * C'est la recette à l'écran qui l'a montré.
 *
 * ⚠ ENTRE LES DEUX, L'ÉCRAN A DIT LA COUPURE — « 200 affichés sur 557 » — parce
 * que c'était tout ce qu'on pouvait faire honnêtement : un pager n'avait nulle
 * part où aller. La session back a ouvert le paramètre (le service paginait
 * depuis toujours, seul le DTO refusait), et le parcours remplace l'aveu.
 *
 * Ce fichier garde les deux invariants que ces trois états ont coûtés :
 * la requête PORTE `page`, et une nouvelle recherche REVIENT à la première.
 */


import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PageAuteurs from '@/app/admin/auteurs/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/auteurs',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const FONCTIONS = ['document.lire', 'catalogue.gerer'];

let urlsAppelees: string[] = [];

function brancher(rendus: number, total: number) {
  urlsAppelees = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL) => {
      const url = String(entree);
      urlsAppelees.push(url);
      const ok = (corps: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(corps) } as Response);
      if (url.includes('/auth/me/functions')) return ok({ functions: FONCTIONS });
      if (url.includes('/authors')) {
        return ok({
          authors: Array.from({ length: rendus }, (_, i) => ({
            id: `a${i}`,
            displayName: `Auteur ${String(i).padStart(3, '0')}`,
            workCount: 1,
          })),
          total,
          page: 1,
          totalPages: Math.ceil(total / 200),
        });
      }
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('Index des auteurs', () => {
  it('557 auteurs : le compteur les annonce et le parcours existe', async () => {
    brancher(200, 557);
    render(<PageAuteurs />);
    expect(await screen.findByText(LIBELLES.auteurs.compte(557))).toBeTruthy();
    expect(screen.getByText(LIBELLES.auteurs.pageSur(1, 3))).toBeTruthy();
    expect(screen.getByRole('button', { name: LIBELLES.auteurs.pageSuivante })).toBeTruthy();
  });

  it('une seule page : pas de commandes de parcours', async () => {
    brancher(120, 120);
    render(<PageAuteurs />);
    expect(await screen.findByText(LIBELLES.auteurs.compte(120))).toBeTruthy();
    // ⚠ Un parcours à une page est un bouton sans effet — le protocole l'interdit.
    expect(screen.queryByRole('button', { name: LIBELLES.auteurs.pageSuivante })).toBeNull();
  });

  /**
   * ⚠ LE CAS DE L'ÉCOLE DE DÉMONSTRATION, celui qui prouve que le défaut ne
   * demandait pas huit mille notices pour exister : 278 auteurs, 200 affichés.
   */
  it('278 auteurs — l’école de démonstration était déjà coupée', async () => {
    brancher(200, 278);
    render(<PageAuteurs />);
    expect(await screen.findByText(LIBELLES.auteurs.compte(278))).toBeTruthy();
    expect(screen.getByText(LIBELLES.auteurs.pageSur(1, 2))).toBeTruthy();
  });

  /**
   * ⚠ LA ROUTE REFUSE `page` : l'envoyer fait répondre 400 et l'écran affiche
   * l'erreur au lieu de la liste. Ce test tient la requête elle-même, parce que
   * c'est la requête qui avait été cassée par ma première correction.
   */
  it('la requête PORTE la page', async () => {
    brancher(200, 557);
    render(<PageAuteurs />);
    await waitFor(() => expect(urlsAppelees.some((u) => u.includes('/authors'))).toBe(true));
    expect(urlsAppelees.find((u) => u.includes('/authors'))!).toMatch(/[?&]page=1\b/);
  });

  /**
   * ⚠ LE PIÈGE DES ÉCRANS QUI FILTRENT ET PAGINENT À LA FOIS. Chercher depuis la
   * page 3 demanderait la page 3 d'un résultat qui n'en a qu'une, et l'écran
   * afficherait « Aucun auteur » sur une recherche qui en trouve dix-sept.
   * Corrigé une fois sur le catalogue ; il se reproduit partout.
   */
  it('une nouvelle recherche revient à la première page', async () => {
    brancher(200, 557);
    render(<PageAuteurs />);
    await screen.findByText(LIBELLES.auteurs.pageSur(1, 3));
    fireEvent.click(screen.getByRole('button', { name: LIBELLES.auteurs.pageSuivante }));
    await waitFor(() =>
      expect(urlsAppelees.some((u) => /[?&]page=2\b/.test(u))).toBe(true),
    );
    urlsAppelees.length = 0;
    fireEvent.change(screen.getByPlaceholderText(/Rechercher|auteur/i), {
      target: { value: 'trao' },
    });
    await waitFor(() => {
      const dernier = urlsAppelees.filter((u) => u.includes('/authors')).pop();
      expect(dernier).toMatch(/[?&]page=1\b/);
      expect(dernier).toMatch(/q=trao/);
    });
  });

  it('rien n’est affirmé avant la réponse', async () => {
    ouvrirSession();
    vi.stubGlobal(
      'fetch',
      vi.fn((e: RequestInfo | URL) =>
        String(e).includes('/auth/me/functions')
          ? Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: FONCTIONS }) } as Response)
          : new Promise<Response>(() => {}),
      ),
    );
    render(<PageAuteurs />);
    // ⚠ `queryBy*` : on affirme une ABSENCE, elle se constate, elle ne s'attend pas.
    await waitFor(() => expect(screen.getByText(LIBELLES.commun.chargement)).toBeTruthy());
    expect(screen.queryByText(/auteur\(s\)/)).toBeNull();
  });
});
