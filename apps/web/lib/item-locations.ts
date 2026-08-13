// Localisations d'exemplaire (demande de la responsable BUC) : liste FIXE de
// trois valeurs. Doit rester alignée avec la liste serveur
// (apps/api/src/cataloging/item-locations.ts) — la validation de vérité est
// côté serveur. On stocke le libellé lisible directement (pas de slug).
export const ITEM_LOCATIONS = ['Salle de lecture', 'Documentation', 'Réserve'];

export function isCanonicalLocation(value: string): boolean {
  return ITEM_LOCATIONS.includes(value);
}
