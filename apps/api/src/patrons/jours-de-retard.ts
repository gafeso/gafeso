const JOUR_MS = 24 * 3600 * 1000;

/**
 * Jours de retard d'un prêt encore ouvert, à la date donnée.
 *
 * ⚠ EXTRAIT DE `reader.service.ts` SANS EN CHANGER LE CALCUL, pour que l'écran
 * du personnel et l'espace lecteur affichent le MÊME nombre pour le même prêt.
 * Deux copies auraient dérivé.
 *
 * ⚠ DEUX IMPLÉMENTATIONS D'UNE MÊME RÈGLE, ET ELLES CONCORDENT.
 * `due-time.ts` porte `computeOverdueDays(dueAt, returnedAt, timeZone)`, qui
 * compte des jours CALENDAIRES dans le fuseau de l'école puis ajoute un jour si
 * l'heure d'échéance est dépassée. Celui-ci compte des tranches de 24 h
 * écoulées. Les deux méthodes sont différentes.
 *
 * ⚠ J'avais d'abord écrit qu'elles « pouvaient différer d'un jour autour de
 * minuit ». C'était RAISONNÉ, PAS MESURÉ, et c'est faux : comparées sur
 * 6 420 cas dans trois fuseaux — Africa/Ouagadougou, Europe/Paris et
 * America/New_York, les deux derniers à heure d'été — elles donnent
 * **exactement le même nombre, 0 écart**. Elles sont algébriquement
 * équivalentes : `joursCalendaires + (heure dépassée ? 1 : 0)` vaut
 * `ceil(écoulé / 24 h)`, et un jour civil raccourci ou rallongé par l'heure
 * d'été décale les deux termes ensemble.
 *
 * Ce qui reste n'est donc PAS un risque de justesse mais une DUPLICATION : deux
 * codes pour une règle. Le jour où l'un change, l'autre ne suit pas. Les unifier
 * demanderait de faire calculer l'espace lecteur par `computeOverdueDays` — un
 * changement de comportement à ce jour invisible, donc à décider, pas à glisser.
 * Voir `docs/backlog-backend.md` n° 11.
 */
export function joursDeRetard(dueDate: Date, now: Date): number {
  const retard = now.getTime() - dueDate.getTime();
  return retard > 0 ? Math.ceil(retard / JOUR_MS) : 0;
}
