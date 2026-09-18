/**
 * ⚠ UNE DÉCONNEXION QUI N'A PAS ABOUTI NE SE DIT PAS « DÉCONNECTÉ ».
 *
 * ⚠ CE QUE ÇA CORRIGE, ET C'EST UNE MESURE, PAS UNE INQUIÉTUDE. Le
 * 16 septembre 2026, dans le volet de recette : `bc_user` effacé, `bc_token`
 * TOUJOURS VALIDE, `/api/auth/me` répondant **200** pour un compte dont
 * l'interface disait qu'il était déconnecté. La route, elle, fonctionne —
 * appelée à la main : `200 → logout 201 → 401`. Ce qui manquait n'était pas le
 * serveur, c'était de LIRE sa réponse :
 *
 *     try { await api('/auth/logout', { method: 'POST' }); }
 *     catch { /* best-effort : on nettoie l'UI quoi qu'il arrive *␟/ }
 *     clearSession();
 *     router.push('/login');
 *
 * Le `catch` rendait l'échec indiscernable du succès. Sur l'ordinateur partagé
 * d'une salle de lecture — le cas canonique de ce produit —, la personne
 * suivante hérite d'une session valide 24 h pendant que l'écran affiche la page
 * de connexion.
 *
 * ⭐ C'est « une fonction qui ne peut pas accomplir son office ne doit pas
 * sortir comme si elle l'avait accompli », appliqué non plus à un ENVOI mais à
 * une FERMETURE — et le coût est de l'autre côté : là-bas personne n'était
 * prévenu, ici quelqu'un croit être parti.
 *
 * ⚠ ON CONTINUE DE NETTOYER L'INTERFACE. La personne a demandé à partir ; la
 * laisser connectée serait pire. Ce qui change, c'est qu'on le DIT et qu'on
 * donne le geste — fermer le navigateur, ou recommencer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LIBELLES } from '@/lib/libelles';

const POUSSEES: string[] = [];
const ROUTEUR = { push: (u: string) => POUSSEES.push(u), replace: vi.fn(), refresh: vi.fn() };
let PARAMS = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ROUTEUR,
  usePathname: () => '/guichet',
  useSearchParams: () => PARAMS,
}));

import { Header } from '@/components/header';
import LoginPage from '@/app/login/page';
import { fermerSession, ouvrirSession } from './aide-session';

let echoue = false;

beforeEach(() => {
  POUSSEES.length = 0;
  PARAMS = new URLSearchParams();
  echoue = false;
  ouvrirSession();
  vi.stubGlobal('fetch', (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    if (url.includes('/auth/logout')) {
      if (echoue) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) } as Response);
    }
    if (url.includes('/auth/me/functions')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ functions: [] }) } as Response);
    }
    // Une doublure qui se tait transforme un oubli en défaut apparent.
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
  });
});

afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

async function cliquerDeconnexion() {
  render(<Header />);
  // ⚠ La déconnexion vit DANS le menu du prénom depuis la refonte du
  // 15 septembre : il faut l'ouvrir. Un `findByRole` sur le bouton caché
  // attendrait ce qui ne viendra jamais — et `findBy*` espère, il ne constate
  // pas.
  const menu = await screen.findByRole('button', { name: /Test/i });
  fireEvent.click(menu);
  // ⚠ `menuitem`, PAS `button` — et c'est le harnais qui me l'a appris. L'entrée
  // porte un `role="menuitem"` explicite, qui REMPLACE le rôle implicite de
  // `<button>` : `getByRole('button')` ne la voit pas, exactement comme un
  // lecteur d'écran l'annonce « élément de menu » et non « bouton ». Chercher
  // par le rôle qu'une technologie d'assistance entend est ce qui rend ce
  // harnais utile — ici il a corrigé le TEST, pas le produit.
  const bouton = await screen.findByRole('menuitem', { name: /Se déconnecter/i });
  fireEvent.click(bouton);
}

describe('La déconnexion dit ce qui s’est réellement passé', () => {
  it('quand elle aboutit : retour à la connexion, sans avertissement', async () => {
    await cliquerDeconnexion();
    await waitFor(() => expect(POUSSEES).toHaveLength(1));
    expect(POUSSEES[0]).toBe('/login');
  });

  it('🔴 quand l’appel ÉCHOUE : l’écran de connexion est prévenu', async () => {
    echoue = true;
    await cliquerDeconnexion();
    await waitFor(() => expect(POUSSEES).toHaveLength(1));
    // ⚠ L'assertion qui porte tout le lot : l'échec ne se confond plus avec le
    // succès. Avant, les deux poussaient exactement '/login'.
    expect(POUSSEES[0]).toBe('/login?deconnexion=incomplete');
  });

  it('l’interface est nettoyée dans les DEUX cas — elle a demandé à partir', async () => {
    echoue = true;
    await cliquerDeconnexion();
    await waitFor(() => expect(POUSSEES).toHaveLength(1));
    expect(document.cookie).not.toMatch(/bc_user=[^;]+/);
  });
});

describe('L’écran de connexion porte l’avertissement, et il dit le GESTE', () => {
  it('sans le paramètre, rien ne s’affiche', () => {
    render(<LoginPage />);
    expect(screen.queryByText(LIBELLES.connexion.deconnexionNonConfirmee)).toBeNull();
  });

  it('avec le paramètre, le texte ET sa sortie', () => {
    PARAMS = new URLSearchParams('deconnexion=incomplete');
    render(<LoginPage />);
    expect(screen.getByText(LIBELLES.connexion.deconnexionNonConfirmee)).toBeTruthy();
    expect(screen.getByText(LIBELLES.connexion.deconnexionNonConfirmeeGeste)).toBeTruthy();
  });

  it('⚠ et le texte PROMET ce pour quoi il existe', () => {
    // Un test qui restate la constante suivrait sa dégradation sans broncher.
    expect(LIBELLES.connexion.deconnexionNonConfirmee).toMatch(/session/i);
    expect(LIBELLES.connexion.deconnexionNonConfirmee).toMatch(/serveur|ouverte/i);
    // Le geste NOMME quoi faire — c'est ce qu'on exige d'un recours.
    expect(LIBELLES.connexion.deconnexionNonConfirmeeGeste).toMatch(/fermez|reconnectez/i);
    expect(LIBELLES.connexion.deconnexionNonConfirmeeGeste).toMatch(/partagé|navigateur/i);
  });
});
