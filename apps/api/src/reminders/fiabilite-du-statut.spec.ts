import { describe, expect, it } from 'vitest';
import { DATE_CORRECTIF_STATUT_ENVOI, statutFiable } from './fiabilite-du-statut';

/**
 * ⚠ LA COUPURE — backlog n°26.
 *
 * On n'a pas rattrapé l'historique : on a rendu SAVOIR qu'il est faux.
 * Ces tests éprouvent la borne, et le dernier éprouve la propriété qui compte
 * — celle qu'un test comparant la constante à elle-même ne verrait pas.
 */
describe('La fiabilité du statut d’envoi d’un rappel', () => {
  it('⚠ une ligne d’AVANT le correctif est invérifiable', () => {
    expect(statutFiable(new Date('2026-09-11T23:59:59Z'))).toBe(false);
  });

  it('une ligne d’APRÈS est fiable', () => {
    expect(statutFiable(new Date('2026-09-12T09:31:21Z'))).toBe(true);
  });

  it('⚠ la seconde EXACTE du correctif est fiable — borne inclusive', () => {
    // Elle a été écrite par le code corrigé. Une borne exclusive jetterait le
    // doute sur des lignes mesurées.
    expect(statutFiable(DATE_CORRECTIF_STATUT_ENVOI)).toBe(true);
  });

  it('⚠ LA PROPRIÉTÉ, et pas seulement la valeur : la coupure est DANS LE PASSÉ', () => {
    // ⚠ Comparer la constante à elle-même ne dirait rien. Ce qui doit rester
    // vrai, c'est qu'elle date du correctif du 12 septembre 2026 (commit
    // e3c913e) — donc qu'elle est derrière nous, et qu'aucune ligne écrite
    // demain ne peut retomber du mauvais côté.
    expect(DATE_CORRECTIF_STATUT_ENVOI.getTime()).toBeLessThan(Date.now());
    expect(DATE_CORRECTIF_STATUT_ENVOI.toISOString()).toMatch(/^2026-09-12T/);
  });
});
