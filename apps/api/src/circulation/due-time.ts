/**
 * Heure d'échéance des prêts, dans le FUSEAU de l'établissement.
 *
 * Auparavant, l'échéance était un instant : `emprunt + 14 × 24 h`. Un prêt fait
 * le 1er à 16 h était donc dû le 15 **à 16 h**, et rendu le 15 à 17 h il coûtait
 * un jour d'amende — ce qu'un bibliothécaire habitué à « dû le 15 » ne
 * comprenait pas.
 *
 * L'échéance tombe désormais à une HEURE FIXE le jour dit (16 h par défaut).
 *
 * POURQUOI RÉGLABLE, et pas une constante : une valeur figée paraît juste ici
 * et redevient fausse chez le client suivant — c'est exactement ce qui s'est
 * produit avec l'année académique calculée sur l'année civile. L'heure ET le
 * fuseau sont donc des réglages d'établissement.
 *
 * Aucune dépendance de fuseau : `Intl` suffit, et l'implémentation reste juste
 * même sous heure d'été (le Burkina n'en a pas, un futur client peut en avoir).
 */

/** Réglages par défaut d'un établissement. */
export const DEFAULT_DUE_TIME = '16:00';
export const DEFAULT_TIMEZONE = 'Africa/Ouagadougou'; // UTC+0, sans heure d'été

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseDueTime(value: string | null | undefined): { h: number; m: number } {
  const m = HHMM.exec((value ?? '').trim());
  if (!m) {
    const d = HHMM.exec(DEFAULT_DUE_TIME)!;
    return { h: Number(d[1]), m: Number(d[2]) };
  }
  return { h: Number(m[1]), m: Number(m[2]) };
}

/** Décalage du fuseau (ms) à un instant donné — positif à l'est de Greenwich. */
function offsetMs(instant: Date, timeZone: string): number {
  // `en-US` + hourCycle h23 donne des champs numériques stables et analysables.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(instant).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - instant.getTime();
}

/** Heure « au mur » (heures/minutes) d'un instant, telle que vue dans le fuseau. */
function wallTimeOf(instant: Date, timeZone: string): { h: number; m: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(instant).map((x) => [x.type, x.value]));
  return { h: Number(p.hour), m: Number(p.minute) };
}

/** Date civile (année/mois/jour) d'un instant, telle que vue dans le fuseau. */
export function civilDate(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(instant).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

/**
 * Instant UTC correspondant à une heure LOCALE (« heure au mur ») d'un fuseau.
 *
 * Deux passes : la première estime le décalage, la seconde le corrige si l'on
 * a franchi une bascule d'heure d'été entre les deux. Sans cette seconde passe,
 * une échéance tombant le jour du changement d'heure serait décalée d'une heure.
 */
export function zonedWallTimeToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const o1 = offsetMs(new Date(utc), timeZone);
  utc -= o1;
  const o2 = offsetMs(new Date(utc), timeZone);
  if (o2 !== o1) utc += o1 - o2;
  return new Date(utc);
}

/**
 * Échéance d'un prêt : `loanPeriodDays` jours CALENDAIRES après l'emprunt, à
 * l'heure d'échéance de l'établissement.
 *
 * Le décompte porte sur les jours calendaires, pas sur des multiples de 24 h.
 * Un emprunt le 1er à 17 h pour 14 jours est donc dû le **15** à 16 h — pas le
 * 16. C'est la règle attendue par un bibliothécaire : « rendu le 15 », quelle
 * que soit l'heure d'emprunt.
 *
 * `Date.UTC` gère de lui-même les fins de mois et les années bissextiles : le
 * 28 février + 1 jour tombe au 29 en 2028, au 1er mars en 2027.
 */
export function computeDueAt(
  borrowedAt: Date,
  loanPeriodDays: number,
  dueTime: string | null | undefined,
  timeZone: string,
): Date {
  const { y, m, d } = civilDate(borrowedAt, timeZone);
  const { h, m: min } = parseDueTime(dueTime);
  // On repasse par une date civile décalée pour laisser Date.UTC normaliser
  // les débordements de mois et d'année.
  const cible = new Date(Date.UTC(y, m - 1, d + loanPeriodDays));
  return zonedWallTimeToUtc(
    cible.getUTCFullYear(),
    cible.getUTCMonth() + 1,
    cible.getUTCDate(),
    h,
    min,
    timeZone,
  );
}

/**
 * Jours de retard : nombre d'heures d'échéance FRANCHIES depuis l'échéance.
 *
 * L'ancien calcul comptait des multiples de 24 h (`ceil(retard / 86 400 000)`).
 * Tant que l'échéance était elle-même un instant + 14 × 24 h, les deux
 * référentiels coïncidaient. Ils ne coïncident plus : l'échéance tombe
 * désormais à une heure AU MUR, et un jour au mur ne fait pas toujours 24 h —
 * il en fait 23 ou 25 lors d'une bascule d'heure d'été. L'amende aurait alors
 * basculé une heure trop tôt ou trop tard, une fois par an, sans rien signaler.
 *
 * La règle rendue est celle qu'un bibliothécaire énonce : « un jour de retard
 * de plus à chaque fois que 16 h repasse sans que le livre soit rendu ».
 *   · rendu le jour dit avant 16 h  → 0 ;
 *   · rendu le jour dit après 16 h  → 1 ;
 *   · rendu le lendemain matin      → 1 (16 h n'est pas repassé) ;
 *   · rendu le lendemain après 16 h → 2.
 *
 * En zone à décalage fixe — le Burkina — le résultat est IDENTIQUE à l'ancien.
 * Ce changement ne modifie aucune amende existante ; il empêche une dérive
 * future chez un client à heure d'été.
 */
export function computeOverdueDays(dueAt: Date, returnedAt: Date, timeZone: string): number {
  if (returnedAt.getTime() <= dueAt.getTime()) return 0;

  const echeance = civilDate(dueAt, timeZone);
  const retour = civilDate(returnedAt, timeZone);

  // Différence en jours CALENDAIRES (Date.UTC sert de calendrier, pas d'horloge).
  const jours = Math.round(
    (Date.UTC(retour.y, retour.m - 1, retour.d) -
      Date.UTC(echeance.y, echeance.m - 1, echeance.d)) /
      86_400_000,
  );

  // A-t-on dépassé l'heure d'échéance dans la journée de retour ?
  //
  // L'heure de référence est lue SUR L'ÉCHÉANCE, pas dans les réglages actuels :
  // un prêt consenti avant un changement de réglage — ou avant cette version —
  // doit être jugé sur l'heure qui était la sienne. Aller chercher 16 h dans la
  // configuration reviendrait à déplacer après coup l'échéance d'un prêt en
  // cours, et donc son amende.
  const { h, m } = wallTimeOf(dueAt, timeZone);
  const limite = zonedWallTimeToUtc(retour.y, retour.m, retour.d, h, m, timeZone);
  const apres = returnedAt.getTime() > limite.getTime() ? 1 : 0;

  return Math.max(0, jours + apres);
}
