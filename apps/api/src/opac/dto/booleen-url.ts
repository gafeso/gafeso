/**
 * Un booléen passé en paramètre d'URL est toujours une chaîne.
 *
 * On reconnaît explicitement les deux formes de chaque côté, et RIEN D'AUTRE :
 * une valeur non reconnue est laissée telle quelle pour que `@IsBoolean` la
 * refuse par une 400.
 *
 * ⚠ Pourquoi pas « tout ce qui n'est pas oui vaut non » : `avecFichier=lol`
 * valait alors « non », en silence, et la page « Documents numériques »
 * montrait des notices SANS fichier sous un titre qui affirmait le contraire.
 * Une faute de frappe doit se voir.
 *
 * Extrait dans un seul endroit : deux DTOs s'en servent, et deux définitions
 * de « ce qu'est un booléen d'URL » finiraient par diverger.
 */
export function booleenDUrl({ value }: { value: unknown }): unknown {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}
