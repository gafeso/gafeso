import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { champsRemplis, enAttentePar, souffler, soumissibles } from './aide-formulaire-charge';

const { api, fonctions } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['catalogue.gerer'] },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));

import Ecran from '@/app/admin/auteurs/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET : réponse retardée → rien de soumissible.
 *
 * ⚠ Les fiches d'autorité se dédoublent au moindre écart : enregistrer avant
 * de voir la liste crée une seconde personne pour la même.
 *
 * Un relevé de source voit une forme ; la propriété est un EFFET. Seule une
 * réponse qu'on résout à la main sépare les deux temps.
 */
describe('/admin/auteurs — épreuve par l’effet', () => {
  it('⚠ réponse RETARDÉE : rien ne peut être enregistré', async () => {
    const attente = enAttentePar(api);
    render(<Ecran />);
    /*
     * ⚠ 300 ms ET NON 30 : cet écran DÉBOUNCE sa recherche à 250 ms. Avec une
     * attente trop courte, le témoin d'appel échouait — et il accusait l'écran
     * de ne rien demander alors qu'il attendait, comme il doit.
     */
    await souffler(300);

    // ⚠ TÉMOIN D'APPEL : sans lui, on mesurerait un écran qui n'a rien demandé.
    expect(attente.chemins().some((c) => c.includes('/authors'))).toBe(true);
    expect(soumissibles(), 'un enregistrement possible avant les données').toBe(0);
    expect(champsRemplis(), 'un champ REMPLI avant les données : il a l’air juste').toBe(0);

    attente.resoudre('/authors', {
      // ⚠ La clé est `authors`, et la ligne porte `workCount` — lu dans le code.
      // Ma version inventée (`items`, `recordCount`) rendait le corps VIDE, donc
      // le test accusait l'écran d'une faute qui était dans sa matière.
      authors: [{ id: 'a1', displayName: 'Ouédraogo, Aïcha', workCount: 2 }],
      total: 1,
      page: 1,
      totalPages: 1,
    });
    await souffler(60);
    expect(document.body.textContent ?? '').toContain('Ouédraogo, Aïcha');
  });

  it('⚠ sans la fonction, on N’APPELLE PAS la route', async () => {
    fonctions.functions = ['document.lire'];
    api.mockClear();
    enAttentePar(api);
    render(<Ecran />);
    await souffler(320);
    expect(api).not.toHaveBeenCalled();
  });
});
