import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { enAttentePar, souffler, soumissibles } from './aide-formulaire-charge';

const { api, fonctions } = vi.hoisted(() => ({
  api: vi.fn(),
  fonctions: { functions: ['etablissement.regles'] },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/functions', () => ({ useMyFunctions: () => fonctions }));

import Ecran from '@/app/admin/regles-de-circulation/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET : réponse retardée → rien de soumissible.
 *
 * ⚠ Durées de prêt et quotas gouvernent la circulation de TOUTE l'école.
 *
 * Un relevé de source voit une forme ; la propriété est un EFFET. Seule une
 * réponse qu'on résout à la main sépare les deux temps.
 */
describe('/admin/regles-de-circulation — épreuve par l’effet', () => {
  it('⚠ réponse RETARDÉE : rien ne peut être enregistré', async () => {
    const attente = enAttentePar(api);
    render(<Ecran />);
    await souffler();

    // ⚠ TÉMOIN D'APPEL : sans lui, on mesurerait un écran qui n'a rien demandé.
    expect(attente.chemins().some((c) => c.includes('/circulation/rules'))).toBe(true);
    expect(soumissibles(), 'un enregistrement possible avant les données').toBe(0);
    /*
     * ⚠ PAS D'ASSERTION « AUCUN CHAMP REMPLI » ICI, et c'est mesuré : le
     * formulaire de cet écran est une CRÉATION, et il PROPOSE des valeurs —
     * 14 jours, 1 renouvellement, 5 emprunts, 0 d'amende. Ce ne sont pas des
     * données non arrivées, c'est une proposition ; l'exiger vide accuserait du
     * code correct.
     *
     * La propriété qui compte sur cet écran est juste au-dessus : on ne peut
     * rien ENREGISTRER tant qu'on ne voit pas les règles existantes.
     */

    attente.resoudre('/circulation/rules', [{ id: 'r1', patronCategory: 'etudiant', itemType: 'livre', loanPeriodDays: 14, renewalLimit: 1, maxConcurrentLoans: 3, finePerDay: 50 }]);
    await souffler(60);
    expect(document.body.textContent ?? '').toContain('etudiant');
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
