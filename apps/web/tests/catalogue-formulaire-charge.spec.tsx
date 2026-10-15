import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { champsRemplis, enAttentePar, souffler, soumissibles } from './aide-formulaire-charge';

const { api, modules } = vi.hoisted(() => ({
  api: vi.fn(),
  modules: { modulesActifs: ['circulation'] as string[] | null },
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('@/lib/modules-actifs', () => ({ useModulesActifs: () => modules }));
vi.mock('next/navigation', () => {
  const routeur = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} };
  return { useParams: () => ({ id: 'n1' }), useRouter: () => routeur };
});

import Ecran from '@/app/admin/catalogue/[id]/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET — et c'est l'écran par lequel j'ai compris que ma liste
 * de dettes était une histoire.
 *
 * Je l'avais déclaré « à migrer » en écrivant que ses 18 champs videraient une
 * notice publiée. En lisant son code : il sort sur `if (!record)` AVANT tout
 * formulaire. La mesure le confirme ici — et c'est elle qui fait foi, parce
 * qu'un `return` précoce dans la source ne dit pas qu'il couvre le formulaire.
 */
const NOTICE = {
  id: 'n1',
  title: 'Textiles et motifs en Afrique de l’Ouest',
  titleComplement: null,
  author: 'Ouoba, Justine',
  contributors: [],
  isbn: null,
  publishYear: 2024,
  category: 'arts',
  recordType: 'ouvrage',
  publisher: null,
  publicationCity: null,
  defenseUniversity: null,
  defensePlace: null,
  summary: null,
  embargoUntil: null,
  keywords: [],
  items: [],
};

describe('/admin/catalogue/[id] — épreuve par l’effet', () => {
  it('⚠ réponse RETARDÉE : aucun champ rempli, rien de soumissible', async () => {
    const attente = enAttentePar(api);
    render(<Ecran />);
    await souffler(40);

    expect(attente.chemins().some((c) => c.includes('/cataloging/records/n1'))).toBe(true);
    expect(soumissibles(), 'un enregistrement possible avant la notice').toBe(0);
    expect(
      champsRemplis(),
      'un champ REMPLI avant la notice : enregistrer écraserait une notice publiée',
    ).toBe(0);

    attente.resoudre('/cataloging/records/n1', NOTICE);
    attente.resoudre('/categories', [{ id: 'c1', name: 'Arts', slug: 'arts' }]);
    attente.resoudre('/cataloging/keywords', []);
    await souffler(80);
    expect(document.body.textContent ?? '').toContain('Textiles et motifs');
  });
});
