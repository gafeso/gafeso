import { BadRequestException } from '@nestjs/common';

/**
 * Localisations d'exemplaire (demande de la responsable BUC) : liste FIXE de
 * trois valeurs, en attendant une éventuelle gestion admin (comme les
 * catégories) si le besoin se confirme. Doit rester alignée avec la liste
 * front (apps/web/lib/item-locations.ts).
 *
 * On stocke le libellé lisible directement (pas de slug) — cohérent avec
 * l'existant (le champ location était un texte libre).
 */
export const ITEM_LOCATIONS = ['Salle de lecture', 'Documentation', 'Réserve'] as const;

export type ItemLocation = (typeof ITEM_LOCATIONS)[number];

function isCanonical(value: string): boolean {
  return (ITEM_LOCATIONS as readonly string[]).includes(value);
}

/**
 * Valide/normalise une localisation à l'ÉCRITURE.
 *  - undefined  → inchangé (PATCH partiel) : renvoie undefined.
 *  - vide/null  → effacement : renvoie null.
 *  - canonique  → conservé.
 *  - héritée    → CONSERVÉE si elle égale la valeur déjà en base (grandfather :
 *    on ne casse pas un exemplaire existant à localisation non conforme).
 *  - sinon      → 400 (une NOUVELLE localisation doit être l'une des trois).
 */
export function normalizeItemLocation(
  input: string | undefined,
  current?: string | null,
): string | null | undefined {
  if (input === undefined) return undefined;
  const value = input.trim();
  if (value === '') return null;
  if (isCanonical(value)) return value;
  // Grandfather : la valeur héritée de l'exemplaire reste acceptée telle quelle.
  if (current != null && value === current.trim()) return value;
  throw new BadRequestException(
    `Localisation invalide. Valeurs autorisées : ${ITEM_LOCATIONS.join(', ')}.`,
  );
}
