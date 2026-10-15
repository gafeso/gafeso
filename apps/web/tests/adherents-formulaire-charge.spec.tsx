import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { champsRemplis, enAttentePar, souffler, soumissibles } from './aide-formulaire-charge';

const { api, fonctions, modules } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['adherents.gerer'] },
  modules: { modulesActifs: ['amendes'] as string[] | null },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));
vi.mock('@/lib/modules-actifs', () => ({ useModulesActifs: () => modules }));
/*
 * ⚠ LE ROUTEUR EST FABRIQUÉ UNE FOIS, DANS LA FABRIQUE. Rendu neuf à chaque
 * appel, il changerait l'identité d'une dépendance d'effet à chaque rendu —
 * boucle infinie, puis un worker qui MEURT sans désigner d'assertion. Le vrai
 * `useRouter` rend un objet stable ; la doublure doit en faire autant.
 */
vi.mock('next/navigation', () => {
  const routeur = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} };
  return { useParams: () => ({ id: 'p1' }), useRouter: () => routeur };
});

import Ecran from '@/app/admin/adherents/[id]/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET — la fiche d'adhérent porte un nom que la
 * bibliothécaire a le droit de CORRIGER (nom d'épouse, orthographe rectifiée).
 * Un formulaire pré-rempli d'un nom qui n'est pas arrivé, enregistré, écraserait
 * exactement cette correction voulue.
 */
const FICHE = {
  id: 'p1',
  firstName: 'Awa',
  lastName: 'Traoré',
  barcode: 'ADH-001',
  category: 'etudiant',
  userId: null,
  registrationDate: '2026-01-10T00:00:00.000Z',
  expiryDate: '2027-01-10T00:00:00.000Z',
  user: null,
  openCheckouts: 0,
  activeHolds: 0,
  nomsDivergents: false,
};

describe('/admin/adherents/[id] — épreuve par l’effet', () => {
  it('⚠ réponse RETARDÉE : aucun champ rempli, rien de soumissible', async () => {
    const attente = enAttentePar(api);
    render(<Ecran />);
    await souffler(40);

    expect(attente.chemins().some((c) => c.includes('/patrons/p1'))).toBe(true);
    expect(soumissibles(), 'un enregistrement possible avant la fiche').toBe(0);
    expect(
      champsRemplis(),
      'un champ REMPLI avant la fiche : enregistrer écraserait un nom corrigé à la main',
    ).toBe(0);

    attente.resoudre('/patrons/p1', FICHE);
    await souffler(60);
    expect(document.body.textContent ?? '').toContain('Traoré');
  });

  it('⚠ sans la fonction, on N’APPELLE PAS la fiche', async () => {
    fonctions.functions = ['document.lire'];
    api.mockClear();
    enAttentePar(api);
    render(<Ecran />);
    await souffler(60);
    expect(api).not.toHaveBeenCalled();
  });
});
