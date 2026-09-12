/**
 * LA PORTE MANQUANTE DU CIRCUIT DE DÉPÔT — `/admin/roles`, 12 septembre 2026.
 *
 * ⚠ LE VRAI ÉTAT, ET IL EST PIRE QUE « LE CIRCUIT N'EST PAS OUVERT ».
 * `depot.deposer` est portée par le rôle SYSTÈME Étudiant, seedé dans CHAQUE
 * école. `depot.valider` n'est portée par AUCUN rôle système — délibérément,
 * côté API : « si personne ne peut valider, le circuit reste inerte plutôt
 * qu'ouvert ».
 *
 * Conséquence mesurée avant d'écrire : **toute école neuve est déjà à moitié
 * ouverte.** Les étudiants peuvent déposer partout, personne ne peut décider
 * nulle part, et un dépôt soumis reste « soumis » sans sortie. L'école en
 * conclut que le dépôt ne marche pas.
 *
 * ⚠ La condition prévue au départ — « seulement si le module `depot` est
 * actif » — n'existe pas : il n'y a PAS de module `depot` au registre, et les
 * routes de dépôt ne portent aucune garde de module. La prémisse était fausse,
 * elle a été corrigée avant d'écrire une ligne.
 *
 * Trois propriétés, et ce sont les trois exigences de Jean :
 *   1. il le DIT — mais jamais pendant le chargement, et jamais si la fonction
 *      est déjà portée ;
 *   2. il ne CRÉE rien tout seul : il pré-remplit, l'administrateur enregistre ;
 *   3. il NOMME ce que le rôle portera — un bouton qui pose des droits sans les
 *      dire est un élargissement en aveugle.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RolesPage from '@/app/admin/roles/page';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/roles',
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const T = LIBELLES.porteDuDepot;
const ADMIN = ['securite.roles'];

const role = (name: string, functions: string[], isSystem = true) => ({
  id: `r-${name}`,
  name,
  description: null,
  functions,
  isSystem,
  _count: { users: 0 },
});

/** L'état d'une école NEUVE : Étudiant porte `depot.deposer`, personne ne valide. */
const ECOLE_NEUVE = [
  role('Étudiant', ['depot.deposer']),
  role('Bibliothécaire', ['catalogue.gerer', 'circulation.faire']),
];

const CATALOGUE = [
  { code: 'depot.valider', libelle: 'Valider les dépôts que l’on dirige' },
  { code: 'depot.deposer', libelle: 'Déposer son mémoire ou sa thèse' },
  { code: 'catalogue.gerer', libelle: 'Gérer le catalogue' },
];

let appels: string[] = [];

function brancher(roles: unknown[] | 'jamais') {
  appels = [];
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      appels.push(`${init?.method ?? 'GET'} ${url}`);
      const ok = (c: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(c) } as Response);
      if (url.includes('/auth/me/functions')) return ok({ functions: ADMIN });
      if (url.includes('/roles/fonctions')) return ok(CATALOGUE);
      if (url.includes('/roles')) {
        if (init?.method === 'POST') return ok(role('Enseignant', ['depot.valider'], false));
        return roles === 'jamais' ? new Promise<Response>(() => {}) : ok(roles);
      }
      throw new Error(`requête non couverte — ${url}`);
    }),
  );
}

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('La porte du dépôt · quand elle se montre', () => {
  it('⚠ école NEUVE : le manque est dit', async () => {
    brancher(ECOLE_NEUVE);
    render(<RolesPage />);
    expect(await screen.findByText(T.titre)).toBeTruthy();
  });

  it('⚠ pendant le CHARGEMENT : rien — un vide qui invite à agir ferait créer', async () => {
    // Le geste proposé est une ÉCRITURE. Le proposer avant de savoir, c'est la
    // faute d'« Aucun domaine créé » : on crée ce qui existait déjà.
    brancher('jamais');
    render(<RolesPage />);
    await waitFor(() => expect(appels.some((a) => a.includes('/roles'))).toBe(true));
    expect(screen.queryByText(T.titre)).toBeNull();
  });

  it('un rôle porte déjà la fonction : rien à détromper, donc rien', async () => {
    // Un avertissement se place là où quelqu'un a pu se tromper, pas partout où
    // le fait est vrai. Le bruit use ce qui doit être lu le jour où ça compte.
    brancher([...ECOLE_NEUVE, role('Enseignant', ['depot.valider'], false)]);
    render(<RolesPage />);
    await screen.findByText('Enseignant');
    expect(screen.queryByText(T.titre)).toBeNull();
  });
});

describe('La porte du dépôt · elle propose, elle ne crée pas', () => {
  it('⚠ le bouton n’écrit RIEN — il pré-remplit le formulaire', async () => {
    brancher(ECOLE_NEUVE);
    render(<RolesPage />);
    fireEvent.click(await screen.findByRole('button', { name: T.proposer }));
    await screen.findByText(T.apresProposition);
    // La seule preuve qui compte : aucune écriture n'est partie.
    expect(appels.some((a) => a.startsWith('POST'))).toBe(false);
  });

  it('le formulaire porte le nom, la description et la SEULE fonction proposée', async () => {
    brancher(ECOLE_NEUVE);
    render(<RolesPage />);
    fireEvent.click(await screen.findByRole('button', { name: T.proposer }));
    await screen.findByText(T.apresProposition);
    expect((await screen.findByDisplayValue(T.nomPropose))).toBeTruthy();
    expect(screen.getByDisplayValue(T.descriptionProposee)).toBeTruthy();
    const cases = [...document.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    const cochees = cases.filter((c) => c.checked);
    expect(cochees).toHaveLength(1);
  });
});

describe('La porte du dépôt · ce que les textes DOIVENT dire', () => {
  it('⚠ le constat dit l’ASYMÉTRIE, pas « le circuit est fermé »', () => {
    // Sa propriété, pas sa valeur. « Le dépôt n'est pas configuré » serait exact
    // et masquerait le fait qui compte : les étudiants peuvent DÉJÀ déposer, et
    // leurs dépôts resteraient sans réponse.
    expect(LIBELLES.porteDuDepot.constat).toMatch(/peuvent déposer|ouvert par défaut/i);
    expect(LIBELLES.porteDuDepot.constat).toMatch(/aucun rôle/i);
    expect(LIBELLES.porteDuDepot.constat).toMatch(/sans réponse|en attente/i);
  });

  it('⚠ il NOMME la fonction que le rôle portera', () => {
    // Un bouton « créer le rôle Enseignant » qui pose des droits sans les dire
    // est un élargissement en aveugle — et c'est la faute d'`etablissement.gerer`,
    // déjà payée une fois.
    expect(LIBELLES.porteDuDepot.ceQueLeRolePortera('depot.valider')).toContain('depot.valider');
    expect(LIBELLES.porteDuDepot.ceQueLeRolePortera('x')).toMatch(/une seule fonction/i);
  });

  it('⚠ il dit que RIEN n’est créé tant qu’on n’a pas enregistré', () => {
    expect(LIBELLES.porteDuDepot.apresProposition).toMatch(/rien n’est créé|pas enregistré/i);
    expect(LIBELLES.porteDuDepot.apresProposition).toMatch(/vérifiez|ajoutez/i);
  });
});
