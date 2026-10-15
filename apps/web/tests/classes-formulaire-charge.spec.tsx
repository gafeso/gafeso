import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { champsRemplis, enAttentePar, souffler, soumissibles } from './aide-formulaire-charge';

const { api, fonctions } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['lecteurs.gerer'] },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));

import Ecran from '@/app/admin/classes/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET : réponse retardée → rien de soumissible.
 *
 * ⚠ Les classes gouvernent l'ACCÈS aux collections — une classe enregistrée
 * de travers ouvre ou ferme un fonds entier.
 *
 * Un relevé de source voit une forme ; la propriété est un EFFET. Seule une
 * réponse qu'on résout à la main sépare les deux temps.
 */
describe('/admin/classes — épreuve par l’effet', () => {
  it('⚠ réponse RETARDÉE : rien ne peut être enregistré', async () => {
    const attente = enAttentePar(api);
    render(<Ecran />);
    await souffler();

    // ⚠ TÉMOIN D'APPEL : sans lui, on mesurerait un écran qui n'a rien demandé.
    expect(attente.chemins().some((c) => c.includes('/enrollment/classes'))).toBe(true);
    expect(soumissibles(), 'un enregistrement possible avant les données').toBe(0);
    expect(champsRemplis(), 'un champ REMPLI avant les données : il a l’air juste').toBe(0);

    attente.resoudre('/enrollment/classes', [
      // ⚠ Forme lue dans l'écran : `activeStudents` et `_count`, pas
      // `studentCount` que j'avais inventé — le corps restait VIDE, et le test
      // accusait l'écran.
      {
        id: 'k1',
        name: 'L1 Droit',
        label: null,
        level: 'L1',
        activeStudents: 30,
        _count: { enrollments: 30 },
      },
    ]);
    await souffler(60);
    expect(document.body.textContent ?? '').toContain('L1 Droit');
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
