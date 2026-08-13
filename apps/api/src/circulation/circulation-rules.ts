/**
 * Règles de circulation — logique pure, testée à part.
 * Les montants sont en FCFA (XOF), entiers, comme partout dans le schéma.
 */

export interface CirculationRuleLike {
  patronCategory: string;
  itemType: string; // '*' = joker (tout type d'exemplaire)
  loanPeriodDays: number;
  maxRenewals: number;
  maxCheckouts: number;
  finePerDay: number; // FCFA / jour de retard
}

/** Règle appliquée quand aucune règle n'est configurée pour la catégorie. */
export const DEFAULT_RULE: CirculationRuleLike = {
  patronCategory: '*',
  itemType: '*',
  loanPeriodDays: 14,
  maxRenewals: 1,
  maxCheckouts: 5,
  finePerDay: 0,
};

export const HOLD_PICKUP_DAYS = 7;

const DAY_MS = 24 * 3600 * 1000;

/**
 * Résout la règle applicable : correspondance exacte (catégorie + type),
 * sinon joker de type ('*') pour la catégorie, sinon règle par défaut.
 */
export function resolveRule(
  rules: CirculationRuleLike[],
  patronCategory: string,
  itemType: string | null,
): CirculationRuleLike {
  const exact = itemType
    ? rules.find(
        (r) => r.patronCategory === patronCategory && r.itemType === itemType,
      )
    : undefined;
  if (exact) return exact;

  const wildcard = rules.find(
    (r) => r.patronCategory === patronCategory && r.itemType === '*',
  );
  if (wildcard) return wildcard;

  // JOKER GLOBAL : une règle `*` / `*` s'applique à toute catégorie d'adhérent
  // et tout type d'exemplaire.
  //
  // Sans ce dernier repli, une telle ligne serait INERTE : le joker ne portait
  // que sur `itemType`, et une règle `*`/`*` n'aurait jamais été trouvée. Le
  // provisioning en pose une à l'ouverture de l'établissement — non pour
  // changer le comportement (elle reprend exactement DEFAULT_RULE), mais pour
  // le rendre VISIBLE : jusqu'ici l'écran des règles était vide, un défaut
  // caché s'appliquait, et le bibliothécaire n'avait rien à regarder ni à
  // modifier. Un réglage invisible ne se corrige pas.
  const global = rules.find((r) => r.patronCategory === '*' && r.itemType === '*');
  return global ?? DEFAULT_RULE;
}

/**
 * @deprecated Remplacé par `computeDueAt` (due-time.ts).
 *
 * Calculait l'échéance en multiples de 24 h : un emprunt à 17 h était dû à
 * 17 h. L'échéance tombe désormais à une HEURE FIXE le jour dit, dans le fuseau
 * de l'établissement. Conservé pour ne pas casser un appelant oublié, mais ne
 * plus utiliser.
 */
export function computeDueDate(from: Date, rule: CirculationRuleLike): Date {
  return new Date(from.getTime() + rule.loanPeriodDays * DAY_MS);
}

import { DEFAULT_TIMEZONE, computeOverdueDays } from './due-time';

export interface FineResult {
  overdueDays: number;
  amountXof: number;
}

/**
 * Amende de retard : jours de retard entamés × tarif/jour (FCFA).
 * Rendu à temps (ou en avance) → 0.
 *
 * Le décompte suit la MÊME référence que l'échéance : l'heure au mur de
 * l'établissement, et non des multiples de 24 h (voir `computeOverdueDays`).
 * Le fuseau est optionnel pour ne pas casser les appelants ; son absence
 * retombe sur celui par défaut, à décalage fixe, où les deux calculs
 * coïncident.
 */
export function computeFine(
  dueDate: Date,
  returnedAt: Date,
  finePerDay: number,
  timeZone: string = DEFAULT_TIMEZONE,
): FineResult {
  const overdueDays = computeOverdueDays(dueDate, returnedAt, timeZone);
  return { overdueDays, amountXof: overdueDays * finePerDay };
}

export type RenewRefusal = 'max_renewals' | 'overdue' | 'holds_pending';

/**
 * Renouvellement refusé si : plafond atteint, prêt déjà en retard, ou
 * réservations actives sur la notice (d'autres lecteurs attendent).
 */
export function canRenew(
  checkout: { renewals: number; dueDate: Date },
  rule: CirculationRuleLike,
  now: Date,
  activeHoldsOnRecord: number,
): { ok: boolean; reason?: RenewRefusal } {
  if (checkout.renewals >= rule.maxRenewals) {
    return { ok: false, reason: 'max_renewals' };
  }
  if (checkout.dueDate.getTime() < now.getTime()) {
    return { ok: false, reason: 'overdue' };
  }
  if (activeHoldsOnRecord > 0) {
    return { ok: false, reason: 'holds_pending' };
  }
  return { ok: true };
}
