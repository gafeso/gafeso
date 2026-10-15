import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { enAttentePar, souffler } from './aide-formulaire-charge';

const { api, fonctions } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['comptes.gerer'] },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));

import Ecran from '@/app/admin/comptes/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET — et l'activation d'un compte POSE UN RÔLE : le geste
 * de cet écran est une écriture de DROIT, pas un réglage.
 */
const COMPTES = {
  total: 1,
  counts: { PENDING: 1 },
  users: [
    {
      id: 'u1',
      email: 'awa@exemple.test',
      matricule: 'M-001',
      firstName: 'Awa',
      lastName: 'Traoré',
      role: 'STUDENT',
      roleId: null,
      status: 'PENDING',
      className: 'L1 Droit',
      classResolved: true,
      createdAt: '2026-10-01T10:00:00.000Z',
    },
  ],
};

describe('/admin/comptes — épreuve par l’effet', () => {
  it('⚠ réponse RETARDÉE : rien ne peut être enregistré', async () => {
    const attente = enAttentePar(api);
    render(<Ecran />);
    await souffler(60);

    expect(attente.chemins().some((c) => c.includes('/accounts'))).toBe(true);
    /*
     * ⚠ ON NE COMPTE PAS LES SOUMISSIBLES ICI, et c'est mesuré : les quatre
     * boutons de cet écran — « En attente », « Actifs », « Tous »,
     * « Rechercher » — sont des FILTRES. Ils vivent dans un `<form>`, donc ils
     * sont `submit`, et ils n'écrivent rien. Les compter accuserait du code
     * correct, ce qui est la façon la plus sûre de faire désactiver un garde.
     *
     * Ce qui ÉCRIT sur cet écran — activer un compte, lui POSER UN RÔLE — vit
     * par LIGNE. La propriété se mesure donc là : pas de ligne, pas de geste.
     */
    expect(
      document.querySelectorAll('tbody tr').length,
      'une ligne de compte avant les données : son activation POSE UN RÔLE',
    ).toBe(0);

    attente.resoudre('/accounts/assignable-roles', [
      { id: 'r1', name: 'Étudiant', isSystem: true },
    ]);
    attente.resoudre('/accounts?', COMPTES);
    await souffler(60);
    expect(document.body.textContent ?? '').toContain('Traoré');
  });

  it('⚠ sans la fonction, on N’APPELLE PAS la liste des comptes', async () => {
    fonctions.functions = ['document.lire'];
    api.mockClear();
    enAttentePar(api);
    render(<Ecran />);
    await souffler(80);
    /*
     * ⚠ MESURÉ : l'effet des RÔLES assignables garde `comptes.gerer` ; celui de
     * la LISTE ne gardait rien. Deux effets dans le même écran, deux
     * disciplines — « la faute est dans l'écart entre deux sites, jamais dans
     * l'un d'eux ».
     */
    expect(api).not.toHaveBeenCalled();
  });
});
