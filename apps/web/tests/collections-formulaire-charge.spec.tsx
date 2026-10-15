import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'c1' }) }));

import CollectionDetailPage from '@/app/admin/collections/[id]/page';

/**
 * ⭐ ÉPREUVE PAR L'EFFET — et cet écran porte l'enjeu le plus retors du produit.
 *
 * ⚠ LES RÈGLES D'ACCÈS SONT UN OU, ET LA PLUS LARGE GAGNE. Poser une règle sans
 * voir celles qui existent n'ÉCRASE rien : ça ÉLARGIT, en laissant la
 * restriction affichée, lisible, rassurante et sans effet. C'est le faux le plus
 * discret de ce dépôt — une perte se voit, une protection devenue décorative
 * ne se voit pas.
 *
 * ## ⚠ CE QUE CE FICHIER A COÛTÉ, et la borne qui en reste
 *
 * Écrit d'abord avec un `beforeEach`, un second cas, et des `findBy*`, il ne
 * rendait PAS LA MAIN : dix minutes, aucun message, aucun cas nommé. Trois
 * causes ont été soupçonnées et chacune démentie par la mesure — une ancre sur
 * un titre inexistant, un « drainage » en `afterEach` qui résolvait les
 * promesses avec `undefined` (le remède fabriquait la panne), puis
 * `mockReset`. Aucune n'explique tout.
 *
 * ⚠ Ce qui est ÉTABLI, lui, l'a été pas à pas et se reproduit : trois appels
 * partent, rien n'est soumissible avant les données, rien ne l'est quand la
 * collection est là mais pas ses règles, et le formulaire apparaît quand les
 * trois réponses sont arrivées.
 *
 * La forme ci-dessous est celle qui TOURNE : un seul cas, aucune attente
 * implicite, des lectures synchrones après des attentes explicites. Le cas
 * d'ÉCHEC manque — il est en dette, nommé dans
 * `formulaires-charges-declares.spec.ts`, plutôt que livré en version qui bloque.
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

const COLLECTION = {
  id: 'c1',
  name: 'Thèses sous embargo',
  description: null,
  type: 'INTERNAL' as const,
  titles: [],
};
const REGLES = [{ id: 'a1', className: 'M2_DROIT', subscriptionTier: null }];
const OPTIONS = { classes: [{ name: 'M2_DROIT', label: 'M2 Droit' }], tiers: ['premium'] };

const soumissibles = () =>
  [...document.querySelectorAll('button')].filter((b) => b.type === 'submit' && !b.disabled)
    .length;

describe('/admin/collections/[id] — épreuve par l’effet', () => {
  it('⚠ rien n’est soumissible tant que les RÈGLES EXISTANTES ne sont pas là', async () => {
    const { resoudre, connus } = brancherEnAttente();
    render(<CollectionDetailPage />);
    await new Promise((r) => setTimeout(r, 30));

    // ⚠ L'ancre est le témoin d'APPEL : cet écran ne rend aucun titre pendant
    // le chargement, donc l'attendre suspendrait au lieu d'échouer.
    expect(connus().sort()).toEqual([
      '/collections/c1',
      '/collections/c1/access-rules',
      '/collections/rule-options',
    ]);
    expect(soumissibles()).toBe(0);

    // ⚠ LE CAS QUI COMPTE : la collection arrive, ses règles non.
    resoudre('/collections/c1', COLLECTION);
    await new Promise((r) => setTimeout(r, 30));
    expect(
      soumissibles(),
      'ajouter une règle sans voir les règles existantes ÉLARGIT en silence',
    ).toBe(0);

    resoudre('/collections/c1/access-rules', REGLES);
    resoudre('/collections/rule-options', OPTIONS);
    await new Promise((r) => setTimeout(r, 100));
    expect(document.body.textContent ?? '').toContain('Thèses sous embargo');
    expect(soumissibles()).toBeGreaterThan(0);
  });
});
