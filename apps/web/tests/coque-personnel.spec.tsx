/**
 * Rendu de la coque du personnel — la recette du lot, au niveau du DOM.
 *
 * Le test de lib/navigation.ts couvre la structure ; celui-ci vérifie qu'elle
 * arrive bien à l'écran, et que la porte d'entrée depuis les pages publiques
 * s'ouvre sur une FONCTION et non sur une liste de rôles.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { AdminShell } from '@/components/admin-shell';
import { Header } from '@/components/header';
import { fermerSession, ouvrirSession } from './aide-session';

let cheminCourant = '/admin/catalogue';

vi.mock('next/navigation', () => ({
  usePathname: () => cheminCourant,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Fonctions réelles du rôle système Bibliothécaire (apps/api/src/auth/functions.ts).
const BIBLIOTHECAIRE = [
  'document.lire',
  'catalogue.gerer',
  'outils.catalogue',
  'circulation.faire',
  'adherents.gerer',
];
const GESTIONNAIRE = [
  'document.lire',
  'outils.lecteurs',
  'lecteurs.voir',
  'comptes.activer',
  'lecteurs.gerer',
];

/** @param fonctions liste, ou 'jamais' pour une réponse qui n'arrive pas. */
function brancherSession(fonctions: string[] | null | 'jamais') {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      // ⚠ Le seul état où « la page ne montre que ☰ » se voit.
      if (fonctions === 'jamais') return new Promise(() => {});
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ functions: fonctions ?? [] }),
      } as Response);
    }),
  );
}

/** Les onglets affichés dans la barre « Sections ». */
async function onglets(): Promise<string[]> {
  const nav = await screen.findByRole('navigation', { name: 'Sections' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent?.trim() ?? '');
}

afterEach(() => {
  vi.unstubAllGlobals();
  fermerSession();
  cheminCourant = '/admin/catalogue';
});

describe('barre d’onglets', () => {
  it('montre les onglets par métier, et pas 15 entrées à plat', async () => {
    brancherSession(BIBLIOTHECAIRE);
    render(<AdminShell>contenu</AdminShell>);

    // CONTRÔLE NÉGATIF n° 6 : rétablir l'ancienne navigation remettrait tout
    // sous « Administration ». Ici, un bibliothécaire voit des onglets métier
    // et AUCUN onglet Administration (il n'a ni etablissement.apparence, ni
    // diffusion.gerer, ni securite.roles, ni securite.audit).
    //
    // ⚠ « Lecteurs » est apparu le 10 septembre 2026 et c'est TOUT L'OBJET du
    // lot : la bibliothécaire détenait `adherents.gerer` sans qu'aucune entrée
    // ne la réclame, donc cet onglet lui restait entièrement fermé. Elle y voit
    // « Adhérents », et rien d'autre — « Comptes » exige lecteurs.voir et
    // « Classes » lecteurs.gerer, qu'elle n'a ni l'une ni l'autre.
    expect(await onglets()).toEqual(['Catalogue', 'Lecteurs', 'Guichet', 'Outils']);
  });

  it('un onglet dont aucune entrée n’est permise n’apparaît pas — ni grisé, ni vide', async () => {
    brancherSession(GESTIONNAIRE);
    cheminCourant = '/admin/comptes';
    render(<AdminShell>contenu</AdminShell>);

    const vus = await onglets();
    expect(vus).toContain('Lecteurs');
    expect(vus).not.toContain('Guichet'); // circulation.faire absent
    expect(vus).not.toContain('Catalogue'); // catalogue.gerer absent
    expect(vus).not.toContain('Administration');
  });

  it('n’affiche rien du back-office à qui n’a aucune fonction', async () => {
    brancherSession([]);
    render(<AdminShell>contenu</AdminShell>);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'réservé au personnel de la bibliothèque',
    );
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
  });
});

describe('barre latérale contextuelle', () => {
  it('« Catégories » est devenu « Domaines »', async () => {
    brancherSession(BIBLIOTHECAIRE);
    render(<AdminShell>contenu</AdminShell>);
    await onglets();

    expect(screen.getByRole('link', { name: 'Domaines' })).toHaveAttribute(
      'href',
      '/admin/categories', // route inchangée : aucun lien en circulation ne casse
    );
    expect(screen.queryByRole('link', { name: 'Catégories' })).toBeNull();
  });

  it('les Outils portent l’import de notices, à sa nouvelle place', async () => {
    brancherSession(BIBLIOTHECAIRE);
    cheminCourant = '/admin/outils/import-notices';
    render(<AdminShell>contenu</AdminShell>);
    await onglets();

    expect(screen.getByRole('link', { name: 'Import de notices' })).toHaveAttribute(
      'href',
      '/admin/outils/import-notices',
    );
    // Et il n'est plus une commande de l'écran de catalogage.
    expect(screen.queryByRole('link', { name: 'Étiquettes et codes-barres' })).toBeNull();
  });
});

describe('porte d’entrée depuis les pages publiques', () => {
  it('un membre du personnel a le lien, là où il avait l’accès sans le lien', async () => {
    brancherSession(BIBLIOTHECAIRE);
    cheminCourant = '/opac';
    render(<Header />);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Espace professionnel' })).toHaveAttribute(
        'href',
        '/admin',
      ),
    );
  });

  it('un lecteur sans fonction ne le voit pas', async () => {
    brancherSession([]);
    cheminCourant = '/opac';
    render(<Header />);
    await screen.findByRole('link', { name: 'Catalogue' });
    expect(screen.queryByRole('link', { name: 'Espace professionnel' })).toBeNull();
  });

  it('le lien disparaît une fois dans l’espace : « Administration » y est une pièce, pas la porte', async () => {
    brancherSession(BIBLIOTHECAIRE);
    cheminCourant = '/admin/catalogue';
    render(<Header fonctions={BIBLIOTHECAIRE} />);
    expect(screen.queryByRole('link', { name: 'Espace professionnel' })).toBeNull();
  });
});

describe('⚠ le contenu ne se cache pas derrière un menu qu’on ignore', () => {
  it('l’écran demandé s’affiche pendant que les fonctions arrivent', async () => {
    // Mesuré le 11 septembre 2026 avec 1,5 s de latence : la page se réduisait
    // à « ☰ » — ni titre, ni écran — pendant toute la réponse, alors que chaque
    // écran sait déjà dire qu'il charge. Un menu qu'on ne connaît pas encore
    // n'est pas une raison de cacher l'écran qu'on a demandé.
    brancherSession('jamais');
    render(<AdminShell>contenu de l’écran</AdminShell>);

    expect(await screen.findByText('contenu de l’écran')).toBeInTheDocument();
    // ⚠ Et toujours AUCUNE entrée : en montrer qui ne seraient pas permises
    // serait pire que d'attendre. `queryByRole` et non `findByRole` — ce
    // dernier ATTEND, et attendre ce qui ne viendra pas fait expirer le test
    // au lieu de l'affirmer.
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
  });
});
