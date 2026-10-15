import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, fonctions } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['etablissement.apparence'] },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));

import PagesLegalesPage from '@/app/admin/pages-legales/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET : réponse retardée → rien de soumissible.
 *
 * ⚠ CET ÉCRAN EST LE PLUS EXPOSÉ DES TROIS : son contenu est PUBLIÉ au dehors.
 * Un enregistrement prématuré n'y reste pas dans l'application — il sort, et
 * `/mentions-legales` est la seule page du produit dont le public EST le
 * dehors.
 *
 * ⚠ Et sa garantie vit dans l'ACTION, pas dans le rendu : « on n'enregistre
 * jamais si on n'a pas pu lire ». C'est juste, et ça laisse un bouton actif
 * qui ne fera rien — un geste sans effet, que ce dépôt refuse d'afficher.
 */
function brancherEnAttente() {
  let resoudre!: (v: unknown) => void;
  let rejeter!: (e: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((ok, ko) => {
        resoudre = ok;
        rejeter = ko;
      }),
  );
  return { resoudre: (v: unknown) => resoudre(v), rejeter: (e: unknown) => rejeter(e) };
}

/*
 * ⚠ FIDÈLE À `PageLegale` : `{ blocs, publieeLe }`, les blocs étant indexés par
 * l'identifiant du modèle (`editeur`, …). Ma première version inventait
 * `titre`/`corps`/`publiee` — et le test échouait en disant « Mentions légales
 * introuvable », c'est-à-dire en accusant l'écran d'une faute qui était dans sa
 * matière. Troisième fois dans ce lot : une charge d'essai se LIT, elle ne
 * s'imagine pas.
 */
const EDITEUR = 'ResurgiTech SARL — Ouagadougou';
const REPONSE = {
  version: 7,
  pagesLegales: {
    mentions: { blocs: { editeur: EDITEUR }, publieeLe: null },
    confidentialite: { blocs: {}, publieeLe: null },
  },
};


const actifs = () =>
  [...document.querySelectorAll('button')].filter((b) => !b.disabled).length;
const champs = () => document.querySelectorAll('input, textarea').length;

describe('/admin/pages-legales — épreuve par l’effet', () => {
  beforeEach(() => {
    api.mockReset();
    fonctions.functions = ['etablissement.apparence'];
  });

  it('⚠ réponse RETARDÉE : aucun champ, aucun bouton actif', async () => {
    const { resoudre } = brancherEnAttente();
    render(<PagesLegalesPage />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(champs(), 'un champ affiché avant les données invite à écrire dans le vide').toBe(0);
    expect(actifs(), 'un bouton actif qui ne fera rien est un geste sans effet').toBe(0);

    resoudre(REPONSE);
    expect(await screen.findByDisplayValue(EDITEUR)).toBeTruthy();
    expect(actifs()).toBeGreaterThan(0);
  });

  it('⚠ ÉCHEC : l’erreur est dite, et aucun formulaire derrière elle', async () => {
    const { rejeter } = brancherEnAttente();
    render(<PagesLegalesPage />);
    await screen.findByRole('heading', { level: 1 });
    rejeter(new Error('réseau'));
    await screen.findByRole('alert');
    expect(champs()).toBe(0);
    expect(actifs()).toBe(0);
  });

  it('⚠ sans la fonction, on N’APPELLE PAS la route', async () => {
    fonctions.functions = ['catalogue.gerer'];
    brancherEnAttente();
    render(<PagesLegalesPage />);
    await new Promise((r) => setTimeout(r, 60));
    expect(api).not.toHaveBeenCalled();
  });
});
