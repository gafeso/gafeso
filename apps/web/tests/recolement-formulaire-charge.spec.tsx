import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { enAttentePar, souffler, soumissibles } from './aide-formulaire-charge';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));

import Ecran from '@/app/admin/recolement/[id]/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET — « marquer les manquants » AGIT sur les exemplaires.
 *
 * ⚠ Et cet écran connaît TROIS états en base (`OPEN`, `CLOSED`, `APPLIED`) :
 * offrir un geste avant de savoir lequel, c'est proposer une réouverture sur
 * une session déjà appliquée. Un écran qui connaît moins d'états que la base n'a
 * pas un affichage incomplet, il a des GESTES faux.
 */
const SESSION = {
  id: 's1',
  name: 'Récolement salle A',
  scope: 'ALL',
  location: null,
  status: 'OPEN',
  progress: { expected: 120, scanned: 12, totalScans: 14 },
};

describe('/admin/recolement/[id] — épreuve par l’effet', () => {
  it('⚠ réponse RETARDÉE : aucun geste offert avant de savoir l’état', async () => {
    const attente = enAttentePar(api);
    render(<Ecran />);
    await souffler(40);

    expect(attente.chemins().some((c) => c.includes('/inventory/sessions/s1'))).toBe(true);
    expect(soumissibles(), 'un geste offert avant de connaître l’état de la session').toBe(0);

    // ⚠ Le RAPPORT d'abord, sinon le fragment de la session l'attraperait aussi.
    attente.resoudre('/inventory/sessions/s1/report', {
      /*
       * ⚠ LA FORME ENTIÈRE, LUE DANS L'ÉCRAN — cinq compteurs et quatre
       * listes. J'ai inventé trois versions successives avant d'ouvrir
       * l'interface ; les trois rendaient le corps VIDE, donc le test accusait
       * l'écran. Septième charge d'essai inventée de ce lot : elle se LIT.
       */
      counts: { seen: 12, missing: 0, onLoan: 0, unexpected: 0, expected: 120 },
      seen: [],
      missing: [],
      onLoan: [],
      unexpected: [],
    });
    attente.resoudre('/inventory/sessions/s1', SESSION);
    await souffler(60);
    expect(document.body.textContent ?? '').toContain('Récolement salle A');
  });
});
