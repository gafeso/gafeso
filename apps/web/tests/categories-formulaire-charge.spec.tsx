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

import Ecran from '@/app/admin/categories/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET : réponse retardée → rien de soumissible.
 *
 * ⚠ Ce vocabulaire décide de la TEINTE des couvertures : une catégorie
 * enregistrée à vide repeindrait tout un domaine.
 *
 * Un relevé de source voit une forme ; la propriété est un EFFET. Seule une
 * réponse qu'on résout à la main sépare les deux temps.
 */
describe('/admin/categories — épreuve par l’effet', () => {
  it('⚠ réponse RETARDÉE : rien ne peut être enregistré', async () => {
    const attente = enAttentePar(api);
    render(<Ecran />);
    await souffler();

    // ⚠ TÉMOIN D'APPEL : sans lui, on mesurerait un écran qui n'a rien demandé.
    expect(attente.chemins().some((c) => c.includes('/categories'))).toBe(true);
    expect(soumissibles(), 'un enregistrement possible avant les données').toBe(0);
    expect(champsRemplis(), 'un champ REMPLI avant les données : il a l’air juste').toBe(0);

    attente.resoudre('/categories', [{ id: 'c1', name: 'Droit', slug: 'droit' }]);
    await souffler(60);
    expect(document.body.textContent ?? '').toContain('Droit');
  });

  it('⚠ sans la fonction, on N’APPELLE PAS la route', async () => {
    fonctions.functions = ['document.lire'];
    api.mockClear();
    enAttentePar(api);
    render(<Ecran />);
    await souffler(60);
    expect(api).not.toHaveBeenCalled();
  });
});
