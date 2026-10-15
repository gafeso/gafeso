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

import AdminAccueilPage from '@/app/admin/accueil/page';
import { LIBELLES } from '@/lib/libelles';

/**
 * ⭐⭐ L'ÉPREUVE PAR L'EFFET : réponse retardée → RIEN DE SOUMISSIBLE.
 *
 * ⚠ ET LE CAS QUI COMPTE EST L'ÉCHEC, pas l'attente. Le drapeau `chargee`
 * écrit à la main en rc13 couvre bien l'attente — mais sur ÉCHEC de chargement,
 * l'écran retombait dans le rendu ordinaire : formulaire rendu avec
 * `EMPTY_CONTENT` et bouton « Enregistrer » ACTIF. Enregistrer à cet instant
 * efface la page d'accueil de l'école.
 *
 * C'est la différence entre « j'ai mis un garde » et « rien n'est resté » : un
 * dispositif se vérifie par son EFFET. Le garde existait, il s'exécutait, et il
 * ne couvrait pas la moitié des cas.
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
 * ⚠ LA CHARGE D'ESSAI EST FIDÈLE À CE QUE LA ROUTE SERT, pas à ce que
 * j'imagine. Ma première version inventait `hero` et `sections` : l'écran a
 * levé « Cannot read properties of undefined (reading 'map') » et n'a plus rien
 * rendu — un test qui échoue en accusant le produit, alors que la faute était
 * dans sa matière. Le témoin ci-dessous le dit : si la forme change, il tombe
 * ici plutôt que dans une assertion qui semblera parler d'autre chose.
 */
const CONTENU = {
  identity: {
    fullName: 'Université d’Exemple',
    acronym: 'UEX',
    brandMark: '',
    subtitle: '',
    tagline: '',
    heroTitle: '',
    heroTitleAccent: '',
    lead: '',
    searchHint: '',
    logoUrl: null,
    heroImageUrl: null,
    heroImageKicker: '',
    heroImageCaption: '',
    heroSlides: [],
  },
  stats: [],
  espaces: [],
  services: [],
  hours: { note: '', lines: [] },
  resources: [],
  contact: {
    description: '',
    partnerNote: '',
    address: '',
    phones: '',
    email: '',
    socials: [],
    copyright: '',
  },
};

const PAGE = {
  primaryColor: '#114B5F',
  themeTokens: {},
  latticeEnabled: true,
  content: CONTENU,
};


const soumissibles = () =>
  [...document.querySelectorAll('button')].filter(
    (b) => b.type === 'submit' && !b.disabled,
  ).length;

describe('la charge d’essai', () => {
  it('⚠ elle porte les clés que l’écran PARCOURT : sinon il lève et le test accuse le produit', () => {
    for (const clef of ['stats', 'espaces', 'services', 'resources'] as const) {
      expect(Array.isArray(CONTENU[clef]), `${clef} doit être un tableau`).toBe(true);
    }
    expect(Array.isArray(CONTENU.identity.heroSlides)).toBe(true);
    expect(Array.isArray(CONTENU.hours.lines)).toBe(true);
    expect(Array.isArray(CONTENU.contact.socials)).toBe(true);
  });
});

describe('/admin/accueil — formulaire chargé', () => {
  beforeEach(() => {
    api.mockReset();
    fonctions.functions = ['etablissement.apparence'];
  });

  it('⚠ réponse RETARDÉE : aucun champ, rien de soumissible, et le motif est DIT', async () => {
    const { resoudre } = brancherEnAttente();
    render(<AdminAccueilPage />);

    expect(await screen.findByRole('heading', { name: 'Page d’accueil' })).toBeTruthy();
    expect(document.querySelectorAll('input, textarea').length).toBe(0);
    expect(soumissibles()).toBe(0);
    expect(screen.getByText(LIBELLES.accueilAdmin.chargementMotif)).toBeTruthy();

    resoudre(PAGE);

    expect(await screen.findByDisplayValue(CONTENU.identity.fullName)).toBeTruthy();
    expect(soumissibles()).toBeGreaterThan(0);
  });

  it('🔴 ÉCHEC du chargement : AUCUN formulaire derrière l’erreur', async () => {
    const { rejeter } = brancherEnAttente();
    render(<AdminAccueilPage />);
    await screen.findByRole('heading', { name: 'Page d’accueil' });

    rejeter(new Error('réseau'));
    await screen.findByRole('alert');

    /*
     * ⚠ C'EST LE CAS QUI MANQUAIT. Un formulaire rendu après un échec est
     * rempli de `EMPTY_CONTENT` : son bouton « Enregistrer » EFFACE la page
     * d'accueil, et rien à l'écran ne l'annonce.
     */
    expect(soumissibles(), 'un formulaire soumissible après un échec de chargement EFFACE la page').toBe(0);
    expect(document.querySelectorAll('input, textarea').length).toBe(0);
  });

  it('⚠ sans la fonction, on N’APPELLE PAS la route', async () => {
    fonctions.functions = ['catalogue.gerer'];
    brancherEnAttente();
    render(<AdminAccueilPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });
});
