/**
 * ⚠ UN ÉTUDIANT D'UNE ÉCOLE QUI N'A PAS OUVERT LE DÉPÔT NE VOIT PAS L'ENTRÉE.
 *
 * *Posé le 14 septembre 2026.*
 *
 * `depot.deposer` est sur le rôle SYSTÈME Étudiant : il est donc seedé dans
 * CHAQUE école. L'en-tête ne testait que la fonction — une école qui éteignait
 * le dépôt voyait quand même « Mon dépôt » chez tous ses étudiants, et le clic
 * tombait sur une 403.
 *
 * ⚠ Et le commentaire du composant AFFIRMAIT DÉJÀ la propriété : « un étudiant
 * d'une école qui n'ouvre pas le dépôt ne doit pas voir une entrée qui le
 * refusera ». Rien ne la vérifiait. Le nom d'un dispositif est une affirmation,
 * et rien dans le dispositif ne la vérifie — ce fichier est ce qui manquait.
 *
 * ⚠ SA DOUBLURE DISTINGUE LES ROUTES, délibérément. Celle de
 * `entete-menu.spec.tsx` répond `{ functions }` à TOUTE url, `/modules`
 * compris : l'état des modules y tombe donc toujours sur « inconnu », et aucun
 * cas de ce fichier n'y serait mesurable. Un repli discret rend un oubli de
 * doublure indiscernable d'un défaut du produit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '@/components/header';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';
import { invaliderModulesActifs } from '@/lib/modules-actifs';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  // ⚠ Fabriqué UNE fois, hors de la fabrique : un objet neuf à chaque rendu
  // entre dans les tableaux de dépendances et boucle jusqu'à l'OOM.
  useRouter: () => routeur,
}));
const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };

const FONCTIONS = ['depot.deposer', 'depot.valider', 'encadrements.voir'];

/** `modules` à `null` : la route ne répond pas — l'état reste INCONNU. */
function brancher(modules: string[] | null) {
  ouvrirSession();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (String(url).includes('/modules')) {
        if (modules === null) return Promise.reject(new Error('injoignable'));
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(modules.map((id) => ({ id, actif: true }))),
        } as Response);
      }
      if (String(url).includes('/functions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: FONCTIONS }) } as Response);
      }
      // ⚠ JAMAIS de repli silencieux : un oubli de doublure doit se voir.
      return Promise.reject(new Error(`requête non couverte — ${url}`));
    }),
  );
}

const repos = () => new Promise((r) => setTimeout(r, 40));
const entrees = () => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));

beforeEach(() => invaliderModulesActifs());
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('L’en-tête et le module `depot`', () => {
  it('⚠ module ÉTEINT : les trois entrées du circuit disparaissent', async () => {
    brancher(['amendes']); // le dépôt n'y est pas
    render(<Header fonctions={FONCTIONS} />);
    await repos();

    for (const href of ['/mon-depot', '/depots-a-valider']) {
      expect(entrees(), `${href} reste visible dans une école sans dépôt`).not.toContain(href);
    }
    // ⚠ ET `/mes-encadrements` RESTE, délibérément. Il lit le CATALOGUE —
    // `recordContributor` joint aux notices —, pas les dépôts : une thèse
    // cataloguée il y a trois ans reste dirigée par son directeur. Éteindre le
    // dépôt ferme le circuit ; il n'efface pas ce qui en est sorti.
    //
    // J'avais posé la condition ici « par symétrie » avec les deux au-dessus.
    // Le témoin de `modules-filtrage-menu.spec.ts` a été écrit pour attraper
    // exactement ce geste, et il l'a attrapé.
    expect(entrees()).toContain('/mes-encadrements');
    // ⚠ TÉMOIN : le reste du menu est intact. Sans lui, un en-tête qui ne rend
    // RIEN passerait ce test — et c'est exactement la façon dont on croit avoir
    // masqué une entrée alors qu'on a cassé le composant.
    expect(entrees()).toContain('/mes-prets');
    expect(entrees()).toContain('/profil');
  });

  it('module ALLUMÉ : les trois entrées sont là', async () => {
    brancher(['depot']);
    render(<Header fonctions={FONCTIONS} />);
    await repos();
    for (const href of ['/mon-depot', '/depots-a-valider', '/mes-encadrements']) {
      expect(entrees(), href).toContain(href);
    }
  });

  it('⚠ état INCONNU : on ne masque rien — l’API refusera si besoin', async () => {
    // Effacer un menu sur une panne réseau serait pire que l'inverse : l'API
    // refuse de toute façon, en nommant le module. C'est elle la garantie.
    brancher(null);
    render(<Header fonctions={FONCTIONS} />);
    await repos();
    expect(entrees()).toContain('/mon-depot');
  });

  it('⚠ module allumé mais fonction absente : rien non plus', async () => {
    // Les deux conditions sont exigées ENSEMBLE. Ce cas garde la moitié que le
    // module ne couvre pas — sinon, ouvrir le dépôt ouvrirait l'entrée à tous.
    brancher(['depot']);
    render(<Header fonctions={[]} />);
    await repos();
    expect(entrees()).not.toContain('/mon-depot');
    expect(LIBELLES.monDepot.titre.length).toBeGreaterThan(0); // le libellé existe bien
  });
});
