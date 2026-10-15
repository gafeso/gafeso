import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * ⚠ `vi.mock` est HOISTÉ au-dessus des imports : une variable de haut niveau
 * référencée dans sa fabrique est dans sa zone morte. `vi.hoisted` est la seule
 * façon de partager un état avec elle — et l'erreur, elle, accuse le fichier
 * MESURÉ (`page.tsx:9`), pas le test. Un instrument qui se trompe désigne
 * volontiers le code qu'il mesure.
 */
const { api, fonctions } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['etablissement.apparence', 'securite.authentification'] },
}));

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));
// ⚠ Déclaré DANS la fabrique : elle ne s'exécute qu'une fois, donc le composant
// est stable — un composant neuf à chaque rendu remonterait l'arbre sans fin.
vi.mock('@/components/tenant-qr', () => ({ TenantQrSection: () => null }));

import EtablissementPage from '@/app/admin/etablissement/page';
import { LIBELLES } from '@/lib/libelles';

/**
 * ⭐⭐ L'ÉPREUVE PRESCRITE : réponse RETARDÉE → rien de modifiable ; données
 * arrivées → formulaire rempli et actif.
 *
 * ⚠ Et ici la réponse retardée n'est pas une précaution d'écriture : c'est la
 * SEULE façon de distinguer les deux temps. Sans elle, la doublure répond au
 * même tour de boucle et l'instant fautif n'existe pas — « la doublure sans
 * latence » est une forme connue d'instrument qui fabrique le monde du test.
 *
 * ⚠ CE QU'ON ÉPROUVE EST PROPRE À CET ÉCRAN : ses champs partaient sur des
 * valeurs par DÉFAUT (`#0F2B46`). Une assertion sur « les champs sont vides »
 * serait restée VERTE sur le défaut — ils n'étaient pas vides, ils étaient
 * FAUX. On affirme donc qu'il n'y a AUCUN champ, puis que la valeur rendue est
 * celle de la réponse.
 */
function brancherEnAttente() {
  let resoudre!: (v: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((ok) => {
        resoudre = ok;
      }),
  );
  return { resoudre: (v: unknown) => resoudre(v) };
}

const REGLAGES = {
  name: 'Université d’Exemple',
  slug: 'zinda',
  primaryColor: '#114B5F',
  secondaryColor: '#E07A2B',
  require2fa: true,
  enrollmentUrl: 'http://localhost:3000/inscription/zinda',
};

describe('/admin/etablissement — formulaire chargé', () => {
  beforeEach(() => {
    api.mockReset();
    fonctions.functions = ['etablissement.apparence', 'securite.authentification'];
  });

  it('⚠ réponse RETARDÉE : aucun champ, aucun bouton Enregistrer, et le motif est DIT', async () => {
    const { resoudre } = brancherEnAttente();
    render(<EtablissementPage />);

    // ⚠ L'ANCRE D'ABORD : sans elle, l'absence serait mesurée avant tout rendu.
    expect(await screen.findByRole('heading', { name: 'Établissement' })).toBeTruthy();

    expect(screen.queryByRole('button', { name: /enregistrer/i })).toBeNull();
    // ⚠ AUCUN champ, quel que soit son type : un relevé par rôle manquerait
    // les sélecteurs de couleur, c'est-à-dire exactement les champs fautifs.
    expect(document.querySelectorAll('input').length).toBe(0);
    // ⚠ Le motif NOMME le dégât : sans lui, l'écran se lit comme cassé.
    expect(screen.getByText(LIBELLES.etablissement.motifChargement)).toBeTruthy();
    expect(screen.getByText(LIBELLES.etablissement.motifChargement).textContent).toMatch(
      /couleurs/i,
    );

    resoudre(REGLAGES);

    // ⚠ APRÈS : rempli AVEC LA RÉPONSE, jamais avec un défaut.
    const bouton = await screen.findByRole('button', { name: /enregistrer/i });
    expect((bouton as HTMLButtonElement).disabled).toBe(false);
    /*
     * ⚠ On relit les VALEURS, pas un rôle : les sélecteurs de couleur sont des
     * `input[type=color]`, qui ne portent pas le rôle `textbox`. Cibler par le
     * rôle aurait fait échouer ce cas en accusant le produit.
     */
    // ⚠ NORMALISÉES : jsdom met en minuscules la valeur d'un `input[type=color]`.
    // Comparer la forme écrite accuserait un produit juste.
    const valeurs = [...document.querySelectorAll('input')].map((c) => c.value.toLowerCase());
    expect(valeurs).toContain('#114b5f');
    expect(valeurs).toContain('#e07a2b');
    // ⚠ TÉMOIN D'ABSENCE sur le défaut EXACT qu'on corrige : la couleur par
    // défaut du code ne doit apparaître nulle part.
    expect(valeurs).not.toContain('#0f2b46');
    expect(valeurs).not.toContain('#d97b2b');
  });

  it('⚠ l’échec a une SORTIE, et aucun formulaire derrière lui', async () => {
    api.mockRejectedValue(new Error('réseau'));
    render(<EtablissementPage />);
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe(LIBELLES.formulaireCharge.echec);
    expect(
      screen.getByRole('button', { name: LIBELLES.formulaireCharge.reessayer }),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('⚠ sans la fonction, on N’APPELLE PAS la route : un 403 affiché serait notre faute', async () => {
    fonctions.functions = ['catalogue.gerer'];
    brancherEnAttente();
    render(<EtablissementPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });
});
