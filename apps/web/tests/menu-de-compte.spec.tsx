/**
 * ⚠ LES ÉCRANS DE LA PERSONNE NE SONT PLUS DANS LA BARRE DE TRAVAIL.
 *
 * *Refonte du 15 septembre 2026.* Un administrateur voyait SEIZE repères
 * cliquables sur `/guichet` — deux barres empilées, dont six écrans personnels
 * posés au milieu des outils du métier. Chacun était arrivé justifié seul ;
 * aucun n'avait été pensé avec les autres.
 *
 * ⚠ LE CRITÈRE DE RANGEMENT, ET C'EST LUI QUE CE FICHIER GARDE : si le titre
 * commence par « Mon » ou « Mes », c'est la PERSONNE. Si c'est une FILE
 * D'ATTENTE, c'est le MÉTIER. « Dépôts à valider » est donc resté dans la
 * barre — un directeur n'y consulte pas SON dépôt, il traite ceux des autres,
 * exactement comme un bibliothécaire traite des retours.
 *
 * ⚠ ET LE BOUTON PORTE LE PRÉNOM. Deux recettes de la semaine ont produit un
 * faux défaut parce que la session ouverte n'était pas celle qu'on croyait —
 * « Mon dépôt est vide » alors qu'on était `admin@` et non `awa@`. Un prénom
 * affiché supprime cette famille entière, y compris le jour d'une
 * présentation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Header } from '@/components/header';
import { NAVIGATION_PERSONNEL } from '@/lib/navigation';
import { fermerSession, ouvrirSession } from './aide-session';
import { invaliderModulesActifs } from '@/lib/modules-actifs';
import { oublierEtablissement } from '@/lib/etablissement';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  // ⚠ Fabriqué UNE fois, hors de la fabrique : un objet neuf à chaque rendu
  // entre dans les tableaux de dépendances et boucle jusqu'à l'OOM.
  useRouter: () => routeur,
}));
const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };

const FONCTIONS = ['depot.deposer', 'depot.valider', 'encadrements.voir'];

function brancher({ ecole = 'Université d’Exemple' }: { ecole?: string | null } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const u = String(url);
      if (u.includes('/modules')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'depot', actif: true }]),
        } as Response);
      }
      if (u.includes('/functions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: FONCTIONS }) } as Response);
      }
      if (u.includes('/tenancy/current')) {
        return ecole === null
          ? Promise.reject(new Error('injoignable'))
          : Promise.resolve({ ok: true, json: () => Promise.resolve({ name: ecole, slug: 'zinda' }) } as Response);
      }
      // ⚠ JAMAIS de repli silencieux : un oubli de doublure doit se voir.
      return Promise.reject(new Error(`requête non couverte — ${u}`));
    }),
  );
}

const repos = () => new Promise((r) => setTimeout(r, 40));
const bouton = () => document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
const liens = () => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
/**
 * ⚠ LES LIENS DU PANNEAU, PAS CEUX DE LA PAGE. « Dépôts à valider » peut
 * apparaître AILLEURS dans l'en-tête — c'est la première entrée métier d'un
 * directeur, donc la destination du lien « Espace professionnel ». Ce qu'on
 * garde ici est qu'elle n'est pas dans le MENU DE COMPTE : une file de travail
 * n'est pas un écran personnel.
 */
const liensDuMenu = () => {
  const panneau = document.querySelector('[role=menu]');
  expect(panneau, 'le menu n’est pas ouvert : la mesure ne vaut rien').not.toBeNull();
  return [...panneau!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
};

async function monter(profil: Record<string, unknown> = {}) {
  ouvrirSession({ firstName: 'Rasmata', lastName: 'Nikiema', ...profil });
  render(<Header fonctions={FONCTIONS} />);
  await repos();
}

beforeEach(() => {
  invaliderModulesActifs();
  oublierEtablissement();
  brancher();
});
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('le bouton de compte', () => {
  it('⚠ porte le PRÉNOM, pas une icône muette', async () => {
    await monter();
    expect(bouton()?.textContent).toContain('Rasmata');
  });

  it('⚠ son nom accessible NOMME la personne', async () => {
    // Un bouton annoncé « Menu » ou « Compte » ne dit pas QUI est connecté —
    // et c'est précisément l'information qui manquait.
    await monter();
    expect(bouton()?.getAttribute('aria-label')).toMatch(/Rasmata/);
  });

  it('⚠ il annonce son état, fermé puis ouvert', async () => {
    await monter();
    expect(bouton()?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(bouton()!);
    expect(bouton()?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('ce que le menu contient', () => {
  it('les écrans de la personne y sont, et EUX SEULS', async () => {
    await monter();
    fireEvent.click(bouton()!);
    const dans = liensDuMenu();
    for (const href of ['/profil', '/mes-prets', '/mon-depot', '/mes-encadrements']) {
      expect(dans, `${href} devrait être dans le menu de compte`).toContain(href);
    }
  });

  it('⚠ « Dépôts à valider » n’y est PAS : c’est une file de travail', async () => {
    // Le cas qui garde le critère. Sans lui, remettre le lien « parce qu'il y
    // était » ne ferait rien tomber, et la barre recommencerait à mélanger les
    // deux logiques.
    await monter();
    fireEvent.click(bouton()!);
    expect(liensDuMenu()).not.toContain('/depots-a-valider');
  });

  it('⚠ et elle est bien DANS la barre métier — pas perdue en route', async () => {
    // Une propriété qui change de porteur est exactement le moment où elle
    // disparaît sans bruit. On vérifie donc les deux moitiés du déménagement,
    // jamais la seule qu'on vient d'écrire.
    const entrees = NAVIGATION_PERSONNEL.flatMap((o) => o.entrees);
    const file = entrees.find((e) => e.href === '/depots-a-valider');
    expect(file, '/depots-a-valider a quitté l’en-tête sans arriver dans la barre').toBeDefined();
    expect(file?.fonctions).toEqual(['depot.valider']);
    expect(file?.module, 'sans son module, éteindre le dépôt la laisserait visible').toBe('depot');
  });

  it('le nom de l’école accompagne celui de la personne', async () => {
    await monter();
    fireEvent.click(bouton()!);
    expect(screen.getByText('Université d’Exemple')).toBeTruthy();
  });

  it('⚠ école inconnue : on n’écrit RIEN plutôt qu’un repli', async () => {
    // Une donnée pas encore chargée ne s'affiche pas comme un fait. Le témoin
    // inversé du cas au-dessus : sans lui, supprimer la ligne pour tout le
    // monde passerait.
    oublierEtablissement();
    brancher({ ecole: null });
    await monter();
    fireEvent.click(bouton()!);
    expect(screen.queryByText('Université d’Exemple')).toBeNull();
    // ⚠ Le témoin qui distingue « la ligne d'école manque » de « le menu ne
    // s'est pas rendu » : le nom de la personne, lui, est bien là.
    expect(screen.getByText('Rasmata Nikiema')).toBeTruthy();
  });
});

describe('⚠ le menu se ferme, et il rend le focus', () => {
  it('Échap ferme et REND LE FOCUS au bouton', async () => {
    // Sans le retour de focus, la personne au clavier se retrouve au début du
    // document, et le menu qu'elle vient de fermer n'est plus atteignable sans
    // retraverser la page.
    await monter();
    fireEvent.click(bouton()!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(bouton()?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(bouton());
  });

  it('un clic au-dehors ferme', async () => {
    await monter();
    fireEvent.click(bouton()!);
    fireEvent.mouseDown(document.body);
    expect(bouton()?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('⚠ sans session, aucun menu de compte', () => {
  it('les deux portes d’entrée restent en clair', async () => {
    // Les replier derrière un menu cacherait précisément ce qu'un visiteur
    // cherche.
    render(<Header fonctions={null} />);
    await repos();
    expect(bouton()).toBeNull();
    expect(liens()).toContain('/login');
    expect(liens()).toContain('/inscription');
  });
});
