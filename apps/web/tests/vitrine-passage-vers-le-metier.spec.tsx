/**
 * ⚠ LE PERSONNEL CONNECTÉ DOIT VOIR SON CHEMIN, PAS LE DEVINER.
 *
 * *Défaut relevé par Jean le 16 septembre 2026, mesuré à l'écran.*
 *
 * La vitrine portait, à la place du compte, un lien nommé du PRÉNOM et menant à
 * `/guichet`. Deux défauts dans un seul contrôle :
 *
 * 1. **Un bouton portant un prénom se lit comme un menu de compte.** Personne
 *    n'y cherche « Guichet ». Le premier geste après connexion était à
 *    découvrir, pas à voir.
 * 2. ⚠ **Et il s'affichait pour TOUT connecté.** Mesuré : la session `awa@`,
 *    étudiante en L1_DROIT, voyait un lien à son propre prénom qui menait à
 *    « Cet espace est réservé au personnel de la bibliothèque ». Une porte sans
 *    écran, offerte à chaque lecteur.
 *
 * ⚠ ET LE MÊME BOUTON AVAIT DEUX GESTES : il NAVIGUAIT sur la vitrine, il
 * DÉROULAIT dans la coque. Un contrôle qui change de comportement selon la page
 * ne s'apprend jamais.
 *
 * ⚠ LA CAUSE, et c'est elle qu'on corrige : le produit a DEUX en-têtes, écrits
 * séparément. Le menu de compte est arrivé dans l'un le 15 septembre ; l'autre
 * a gardé son idée de ce qu'un compte offre. C'est « deux tableaux qui se
 * ressemblent » à l'échelle d'un composant. Les deux lisent désormais
 * `useCompteCourant` — une seule source, ou ils divergeront encore.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HomeHeader } from '@/components/home/home-header';
import { LIBELLES } from '@/lib/libelles';
import { fermerSession, ouvrirSession } from './aide-session';
import { invaliderModulesActifs } from '@/lib/modules-actifs';
import { oublierEtablissement } from '@/lib/etablissement';

vi.mock('next/navigation', () => ({ useRouter: () => routeur }));
const routeur = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };

/** Ce que porte un bibliothécaire : au moins une entrée de la barre métier. */
const BIBLIOTHECAIRE = ['catalogue.gerer', 'circulation.faire', 'document.lire'];
/** Ce que porte une étudiante : aucune entrée métier. */
const ETUDIANTE = ['depot.deposer', 'document.lire'];

function brancher(fonctions: string[]) {
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
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ functions: fonctions }) } as Response);
      }
      if (u.includes('/tenancy/current')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ name: 'Université d’Exemple', slug: 'zinda' }),
        } as Response);
      }
      // ⚠ JAMAIS de repli silencieux : un oubli de doublure doit se voir.
      return Promise.reject(new Error(`requête non couverte — ${u}`));
    }),
  );
}

const repos = () => new Promise((r) => setTimeout(r, 40));

async function monter(fonctions: string[], prenom = 'Rasmata') {
  ouvrirSession({ firstName: prenom, lastName: 'Nikiema' });
  brancher(fonctions);
  render(
    <HomeHeader brandMark="UE" logoUrl={null} acronym="UEX" subtitle="Bibliothèque" navItems={[]} />,
  );
  await repos();
}

const boutonCompte = () => document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
const lienPro = () =>
  [...document.querySelectorAll('a')].find(
    (a) => (a.textContent || '').trim() === LIBELLES.entete.espaceProfessionnel,
  );

beforeEach(() => {
  invaliderModulesActifs();
  oublierEtablissement();
});
afterEach(() => {
  fermerSession();
  vi.unstubAllGlobals();
});

describe('le passage vers le métier', () => {
  it('⚠ un membre du personnel le VOIT, et il dit ce qu’il ouvre', async () => {
    await monter(BIBLIOTHECAIRE);
    const lien = lienPro();
    expect(lien, 'aucun chemin visible vers son travail').toBeTruthy();
    expect(lien!.getAttribute('href')).toMatch(/^\/(admin|guichet|depots)/);
  });

  it('⚠ une LECTRICE ne le voit pas — une porte sans écran n’existe pas', async () => {
    // Le cœur du défaut : `awa@`, étudiante, voyait un lien à son propre prénom
    // qui menait à « cet espace est réservé au personnel de la bibliothèque ».
    await monter(ETUDIANTE, 'Awa');
    expect(lienPro()).toBeUndefined();
    // Témoin : elle est bien connectée et son compte est là — sans lui, un
    // en-tête qui ne rend RIEN passerait l'assertion ci-dessus.
    expect(boutonCompte()?.textContent).toContain('Awa');
  });

  it('⚠ et personne ne le voit sans session', async () => {
    brancher([]);
    render(
      <HomeHeader brandMark="UE" logoUrl={null} acronym="UEX" subtitle="Bibliothèque" navItems={[]} />,
    );
    await repos();
    expect(lienPro()).toBeUndefined();
    expect(boutonCompte()).toBeNull();
    expect([...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/login')).toBe(true);
  });
});

describe('⚠ le bouton de compte n’a qu’UN geste', () => {
  it('c’est un BOUTON qui déroule, jamais un lien qui navigue', async () => {
    // Il naviguait ici et déroulait ailleurs. Un contrôle qui change de
    // comportement selon la page ne s'apprend jamais.
    await monter(BIBLIOTHECAIRE);
    const b = boutonCompte();
    expect(b, 'le compte n’est pas un bouton').not.toBeNull();
    expect(b!.tagName).toBe('BUTTON');
    expect(b!.getAttribute('href')).toBeNull();
    expect(b!.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(b!);
    expect(b!.getAttribute('aria-expanded')).toBe('true');
  });

  it('⚠ AUCUN lien de la vitrine ne mène au guichet sous un prénom', async () => {
    // L'assertion d'ABSENCE qui garde le retrait : un contrôle négatif ne peut
    // pas révéler ce qui n'a plus à être écrit.
    await monter(BIBLIOTHECAIRE);
    const suspects = [...document.querySelectorAll('a')].filter(
      (a) => a.getAttribute('href') === '/guichet' && (a.textContent || '').trim() === 'Rasmata',
    );
    expect(suspects).toEqual([]);
  });

  it('le menu porte les écrans de la personne, et son école', async () => {
    await monter(BIBLIOTHECAIRE);
    fireEvent.click(boutonCompte()!);
    const panneau = document.querySelector('[role=menu]')!;
    const liens = [...panneau.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(liens).toContain('/profil');
    expect(liens).toContain('/mes-prets');
    expect(screen.getByText('Université d’Exemple')).toBeTruthy();
  });
});
