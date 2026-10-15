import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api, fonctions, modules } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['securite.roles'] },
  /*
   * ⚠ LA FORME EXACTE DU CROCHET : `{ modulesActifs: string[] | null }`. Ma
   * première doublure rendait `{ actifs, estActif }` — inventé —, et l'écran
   * levait « Cannot read properties of undefined (reading 'includes') », donc
   * le test accusait l'écran d'une faute qui était dans ma doublure.
   */
  modules: { modulesActifs: ['roles'] as string[] | null },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));
vi.mock('@/lib/modules-actifs', () => ({ useModulesActifs: () => modules }));

import RolesPage from '@/app/admin/roles/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET — `/admin/roles` est le plus coûteux des « déjà
 * gardés » : un enregistrement prématuré y RETIRE des fonctions à tout un rôle,
 * donc à toutes les personnes qui le portent, d'un coup.
 *
 * ⚠ CET ÉCRAN FAIT DEUX APPELS EN PARALLÈLE (`Promise.all`). La doublure doit
 * donc pouvoir en résoudre un sans l'autre : c'est le seul moyen de savoir si
 * l'écran attend LES DEUX. Une doublure qui résout tout d'un coup ne mesure que
 * le cas nominal — et c'est la moitié qui ne casse jamais.
 */
function brancherEnAttente() {
  const resolveurs: Record<string, (v: unknown) => void> = {};
  api.mockImplementation(
    (chemin: string) =>
      new Promise((ok) => {
        resolveurs[chemin] = ok as (v: unknown) => void;
      }),
  );
  return {
    resoudre: (chemin: string, v: unknown) => resolveurs[chemin]?.(v),
    connus: () => Object.keys(resolveurs),
  };
}

const ROLES = [
  {
    id: 'r1',
    name: 'Bibliothécaire',
    description: null,
    functions: ['document.lire'],
    isSystem: true,
    _count: { users: 3 },
  },
];
const CATALOGUE = [{ code: 'document.lire', libelle: 'Lire un document' }];

/*
 * ⚠ ON COMPTE LES SOUMISSIBLES, PAS LES BOUTONS ACTIFS. Ma première assertion
 * comptait tout : elle a signalé « Créer un rôle », qui OUVRE un panneau et ne
 * soumet rien. Un garde qui accuse un bouton légitime se fait désactiver.
 *
 * La propriété est « rien de soumissible avant les données » — ce qui ÉCRIT,
 * pas ce qui s'affiche.
 */
const soumissibles = () =>
  [...document.querySelectorAll('button')].filter((b) => b.type === 'submit' && !b.disabled)
    .length;
const champs = () => document.querySelectorAll('input, textarea').length;

describe('/admin/roles — épreuve par l’effet', () => {
  beforeEach(() => {
    api.mockReset();
    fonctions.functions = ['securite.roles'];
  });

  it('⚠ réponse RETARDÉE : aucun champ, aucun bouton actif', async () => {
    const { resoudre, connus } = brancherEnAttente();
    render(<RolesPage />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(champs()).toBe(0);
    expect(soumissibles()).toBe(0);

    // ⚠ TÉMOIN : les DEUX appels sont bien partis — sinon la suite ne mesure
    // qu'un écran qui n'a jamais rien demandé.
    expect(connus().sort()).toEqual(['/roles', '/roles/fonctions']);

    /*
     * ⚠ ET LE FAIT PROPRE À CET ÉCRAN : le vide ne doit pas être AFFIRMÉ. « Aucun
     * rôle » affiché pendant le chargement ferait créer un doublon d'un rôle qui
     * existe — et le geste, lui, existera.
     */
    expect(document.body.textContent ?? '').not.toMatch(/aucun rôle/i);

    /*
     * ⚠ UN SEUL DES DEUX RÉSOLU : l'écran ne doit toujours rien offrir. Sans ce
     * cas, un écran qui n'attendrait QUE la première réponse passerait pour
     * juste — et il rendrait sa liste de fonctions vide, donc un enregistrement
     * RETIRERAIT toutes les fonctions du rôle.
     */
    resoudre('/roles', ROLES);
    await new Promise((r) => setTimeout(r, 30));
    expect(champs(), 'un champ offert avant le catalogue des fonctions').toBe(0);
    expect(soumissibles(), 'un enregistrement possible avant le catalogue des fonctions').toBe(0);

    resoudre('/roles/fonctions', CATALOGUE);
    expect(await screen.findByText('Bibliothécaire')).toBeTruthy();
  });

  it('⚠ sans la fonction, on N’APPELLE PAS les routes', async () => {
    fonctions.functions = ['catalogue.gerer'];
    brancherEnAttente();
    render(<RolesPage />);
    await new Promise((r) => setTimeout(r, 60));
    expect(api).not.toHaveBeenCalled();
  });
});
