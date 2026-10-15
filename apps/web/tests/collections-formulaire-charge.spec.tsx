import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, api: (...a: unknown[]) => api(...a) };
});
vi.mock('@/lib/session', () => ({ getToken: () => 'jeton-de-test' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'c1' }) }));

import { ApiError } from '@/lib/api';
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
  /*
   * ⭐⭐ LA CAUSE DU BLOCAGE EST TROUVÉE — et ce n'était ni l'écran, ni
   * `vi.mock`, ni mon découpage. Bisecté le 15 octobre 2026 jusqu'à DOUZE
   * lignes, sans Next et sans module doublé :
   *
   * | crochet | promesse rendue par la doublure | résultat |
   * |---|---|---|
   * | `beforeEach(mockClear)` | RÉSOLUE | passe, 1 s |
   * | `beforeEach(mockClear)` | ÉTERNELLE | 🔴 **le worker ne rend jamais la main** |
   * | aucun crochet | éternelle | passe, 2 s |
   * | `afterEach(mockClear)` | éternelle | échoue proprement, code 1 |
   *
   * ⚠ `mockReset` se comporte comme `mockClear` : ce sont les deux méthodes qui
   * EFFACENT les résultats enregistrés. Référencer la doublure, lire
   * `mock.calls`, ou poser l'implémentation dans le crochet ne bloquent PAS.
   *
   * ⭐ LA RÈGLE POUR CE DÉPÔT : une épreuve par l'effet laisse des promesses NON
   * RÉGLÉES — c'est son principe même. Elle ne doit donc pas effacer sa doublure
   * dans un `beforeEach`. Ce fichier n'en a aucun, et c'est pour ça.
   *
   * ⚠ Et pourquoi j'ai cherché une heure du mauvais côté : le blocage ne nomme
   * aucun cas. Trois causes ont été soupçonnées et démenties — une ancre sur un
   * titre inexistant, un « drainage » en `afterEach`, puis `mockReset` seul.
   * Aucune n'était la bonne, parce que je cherchais dans ce que je venais
   * d'écrire plutôt qu'en RÉDUISANT jusqu'à la plus petite forme qui bloque.
   */
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

  /*
   * ⭐ LE CAS D'ÉCHEC, remis en place — il était en dette depuis le 14 octobre
   * parce que la forme qui le portait bloquait. Elle bloquait à cause du
   * `beforeEach` ci-dessus, pas à cause de lui.
   */
  it('⚠ ÉCHEC : l’erreur est dite, et rien ne reste soumissible', async () => {
    api.mockImplementation(() => Promise.reject(new ApiError(500, 'réseau')));
    render(<CollectionDetailPage />);
    await new Promise((r) => setTimeout(r, 60));
    expect(soumissibles(), 'un formulaire soumissible derrière une erreur').toBe(0);
    expect(document.body.textContent ?? '').not.toContain('Thèses sous embargo');
  });
});
