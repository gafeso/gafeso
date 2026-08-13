/**
 * Année académique courante, au format « 2026-2027 ».
 *
 * POURQUOI CÔTÉ SERVEUR : depuis que l'inscription est la source de vérité de
 * la classe d'un étudiant (voir enrollment.service.enrol), toute écriture de
 * classe crée une inscription — laquelle exige une année. Cette valeur ne
 * pouvait donc plus être laissée au navigateur.
 *
 * Elle l'était : app/admin/classes/page.tsx calculait
 * `${currentYear}-${currentYear + 1}` sur l'année CIVILE. C'est juste de
 * septembre à décembre, et faux de janvier à août — en mars 2027 on obtenait
 * « 2027-2028 » alors que l'année en cours est « 2026-2027 », ce qui inscrivait
 * l'étudiant dans une année future et le laissait sans classe active.
 *
 * Le basculement se fait au 1er du mois de rentrée (septembre par défaut,
 * surchargeable par ACADEMIC_YEAR_START_MONTH pour les calendriers du Sud ou
 * les rentrées décalées).
 */

/** Mois de rentrée par défaut (1 = janvier … 12 = décembre). */
export const DEFAULT_ACADEMIC_YEAR_START_MONTH = 9;

/** Format attendu d'une année académique : deux années consécutives. */
export const ACADEMIC_YEAR_RE = /^(\d{4})-(\d{4})$/;

export function currentAcademicYear(
  now: Date = new Date(),
  startMonth: number = DEFAULT_ACADEMIC_YEAR_START_MONTH,
): string {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new Error(`Mois de rentrée invalide : ${startMonth} (1 à 12 attendu).`);
  }
  const year = now.getFullYear();
  // getMonth() est 0-indexé ; avant le mois de rentrée, on est encore dans
  // l'année académique ouverte l'automne précédent.
  const first = now.getMonth() + 1 >= startMonth ? year : year - 1;
  return `${first}-${first + 1}`;
}

/** Valide le format et la consécutivité des deux années. */
export function isValidAcademicYear(value: string): boolean {
  const m = ACADEMIC_YEAR_RE.exec(value);
  if (!m) return false;
  return Number(m[2]) === Number(m[1]) + 1;
}
