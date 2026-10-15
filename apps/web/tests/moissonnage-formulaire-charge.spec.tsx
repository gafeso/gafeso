import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, fonctions } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['outils.catalogue'] },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));

import MoissonnagePage from '@/app/admin/moissonnage/page';

/**
 * ⭐ L'ÉPREUVE PAR L'EFFET, demandée pour TOUS les écrans — y compris ceux qu'un
 * relevé de source déclare « gardés ». Un relevé voit une forme ; il ne peut pas
 * dire si la garde couvre bien le formulaire. Seul ceci le dit :
 *
 *     réponse retardée → RIEN DE SOUMISSIBLE
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
 * ⚠ FIDÈLE À L'INTERFACE `Source` DE L'ÉCRAN, pas à ce que j'imagine. Ma
 * première version portait `nom`, `url`, `protocole` : le test échouait en
 * disant « Bibliothèque nationale introuvable », c'est-à-dire en accusant
 * l'écran d'une faute qui était dans sa matière.
 */
const SOURCES = [
  {
    id: 's1',
    name: 'Bibliothèque nationale',
    baseUrl: 'https://exemple.test/oai',
    metadataPrefix: 'oai_dc',
    setSpec: '',
    periodicity: 'hebdomadaire',
    active: true,
    derniereExecution: null,
  },
];

const soumissibles = () =>
  [...document.querySelectorAll('button')].filter((b) => b.type === 'submit' && !b.disabled)
    .length;

describe('/admin/moissonnage — épreuve par l’effet', () => {
  beforeEach(() => {
    api.mockReset();
    fonctions.functions = ['outils.catalogue'];
  });

  it('⚠ réponse RETARDÉE : rien de soumissible, et le vide n’est pas AFFIRMÉ', async () => {
    const { resoudre } = brancherEnAttente();
    render(<MoissonnagePage />);

    // ⚠ L'ANCRE D'ABORD, sinon l'absence est mesurée avant tout rendu.
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(soumissibles()).toBe(0);
    expect(document.querySelectorAll('input, textarea').length).toBe(0);

    /*
     * ⚠ ET LE SECOND FAIT, qui est propre à cet écran : un « aucun entrepôt »
     * affiché pendant le chargement ferait DÉCLARER UN DOUBLON. Un vide qui
     * invite à agir est pire qu'un vide muet — le geste, lui, existera.
     */
    const texte = document.body.textContent ?? '';
    expect(texte).not.toMatch(/aucun entrepôt|aucune source/i);

    resoudre(SOURCES);
    expect(await screen.findByText('Bibliothèque nationale')).toBeTruthy();
  });

  it('⚠ ÉCHEC : l’erreur est dite, et le vide n’est toujours pas affirmé', async () => {
    const { rejeter } = brancherEnAttente();
    render(<MoissonnagePage />);
    await screen.findByRole('heading', { level: 1 });

    rejeter(new Error('réseau'));
    await screen.findByRole('alert');

    const texte = document.body.textContent ?? '';
    expect(texte).not.toMatch(/aucun entrepôt|aucune source/i);
  });

  it('⚠ sans la fonction, on N’APPELLE PAS la route', async () => {
    fonctions.functions = ['catalogue.gerer'];
    brancherEnAttente();
    render(<MoissonnagePage />);
    await new Promise((r) => setTimeout(r, 60));
    expect(api).not.toHaveBeenCalled();
  });
});
