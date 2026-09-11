/**
 * En-tête applicatif — menu replié et cibles tactiles.
 *
 * ⚠ Ce que ce fichier PEUT et NE PEUT PAS prouver.
 * Le repli de l'en-tête est piloté par CSS (`hidden md:flex`) et non par un
 * montage conditionnel, contrairement au bandeau d'accueil. C'est le bon choix
 * ici : ce sont des LIENS TEXTE, masquer ne coûte rien au réseau — l'interdit
 * du montage CSS ne vaut que pour les images. Conséquence : jsdom n'applique
 * pas les media queries, les deux rendus coexistent dans le DOM, et la
 * hauteur de barre à 375 px se vérifie AU NAVIGATEUR, pas ici.
 *
 * Ce fichier verrouille ce qui est vérifiable sans mise en page : l'existence
 * du bouton, son état accessible, le contenu du panneau, et sa fermeture.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Header } from '@/components/header';
import { fermerSession, ouvrirSession } from './aide-session';

let chemin = '/opac';
vi.mock('next/navigation', () => ({
  usePathname: () => chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function brancher(fonctions: string[] | null, connecte = true) {
  if (connecte) ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: fonctions ?? [] }) } as Response),
    ),
  );
}

const bouton = () => screen.getByRole('button', { name: 'Menu' });
const panneau = () => document.getElementById('menu-principal');

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
  chemin = '/opac';
});

describe('menu replié', () => {
  it('expose un bouton Menu dont l’état est annoncé', () => {
    brancher([]);
    render(<Header fonctions={[]} />);

    expect(bouton()).toHaveAttribute('aria-expanded', 'false');
    expect(bouton()).toHaveAttribute('aria-controls', 'menu-principal');
    expect(panneau()).toBeNull();
  });

  it('ouvre et referme le panneau, et l’annonce', () => {
    brancher([]);
    render(<Header fonctions={[]} />);

    fireEvent.click(bouton());
    expect(bouton()).toHaveAttribute('aria-expanded', 'true');
    expect(panneau()).toBeTruthy();

    fireEvent.click(bouton());
    expect(bouton()).toHaveAttribute('aria-expanded', 'false');
    expect(panneau()).toBeNull();
  });

  it('le panneau porte les MÊMES entrées que la barre — aucune n’est perdue au repli', () => {
    brancher([]);
    render(<Header fonctions={[]} />);
    fireEvent.click(bouton());

    const dans = within(panneau()!);
    for (const libelle of ['Accueil', 'Catalogue', 'Mes prêts', 'Mon compte']) {
      expect(dans.getByRole('link', { name: libelle }), libelle).toBeInTheDocument();
    }
    expect(dans.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();
  });

  it('un membre du personnel retrouve « Espace professionnel » dans le panneau', async () => {
    brancher(['catalogue.gerer']);
    render(<Header />);
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Espace professionnel' }).length).toBeGreaterThan(0));

    fireEvent.click(bouton());
    expect(within(panneau()!).getByRole('link', { name: 'Espace professionnel' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('un visiteur non connecté y trouve la connexion et l’inscription', () => {
    brancher([], false);
    render(<Header fonctions={[]} />);
    fireEvent.click(bouton());

    const dans = within(panneau()!);
    expect(dans.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument();
    expect(dans.getByRole('link', { name: 'Créer un compte' })).toBeInTheDocument();
    expect(dans.queryByRole('link', { name: 'Mes prêts' })).toBeNull();
  });

  it('se referme quand on suit un lien — il ne reste pas par-dessus la page d’arrivée', () => {
    brancher([]);
    render(<Header fonctions={[]} />);
    fireEvent.click(bouton());

    fireEvent.click(within(panneau()!).getByRole('link', { name: 'Catalogue' }));
    expect(panneau()).toBeNull();
    expect(bouton()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('cibles tactiles', () => {
  it('chaque entrée de l’en-tête réserve 44 px de hauteur', () => {
    // jsdom ne calcule pas de mise en page : on vérifie la CLASSE qui porte la
    // contrainte (min-h-11 = 2,75 rem = 44 px), et la hauteur réelle est
    // mesurée au navigateur. Retirer la classe fait tomber ce test.
    brancher([]);
    const { container } = render(<Header fonctions={[]} />);
    fireEvent.click(bouton());

    const interactifs = [
      ...container.querySelectorAll('nav a'),
      ...container.querySelectorAll('nav button'),
      bouton(),
    ];
    expect(interactifs.length).toBeGreaterThan(4);
    for (const el of interactifs) {
      expect(el.className, `${el.textContent?.trim()} n'a pas de hauteur minimale`).toMatch(
        /min-h-11/,
      );
    }
  });
});
