/**
 * L'ÉTAT D'EMBARGO D'UNE NOTICE — une seule lecture, partagée par les écrans.
 *
 * ⚠ TROIS ÉTATS, PAS DEUX. `embargoUntil` est une date ou `null`, mais ce que
 * les écrans doivent dire en compte trois : aucun embargo, un embargo EN COURS,
 * et un embargo ÉCHU — une date passée qui n'interdit plus rien. Les confondre
 * ferait afficher « sous embargo » sur un document redevenu lisible, ce qui est
 * exactement le contraire de ce que le lecteur doit comprendre.
 *
 * ⚠ ET C'EST LA MÊME BORNE QUE L'API. `sousEmbargo()` y compare
 * `embargoUntil.getTime() > maintenant` — strictement supérieur. On reprend la
 * comparaison telle quelle : deux implémentations d'une même frontière
 * divergent le jour où l'une change, et c'est le lecteur qui paie la
 * différence.
 */

export type EtatEmbargo =
  | { etat: 'aucun' }
  | { etat: 'en-cours'; jusquAu: Date }
  | { etat: 'echu'; depuis: Date };

export function lireEmbargo(
  embargoUntil: string | null | undefined,
  maintenant: Date = new Date(),
): EtatEmbargo {
  if (!embargoUntil) return { etat: 'aucun' };
  const date = new Date(embargoUntil);
  // Une date illisible n'est pas un embargo : on ne bloque rien sur une valeur
  // qu'on ne comprend pas, et on ne prétend pas non plus qu'elle en est un.
  if (Number.isNaN(date.getTime())) return { etat: 'aucun' };
  return date.getTime() > maintenant.getTime()
    ? { etat: 'en-cours', jusquAu: date }
    : { etat: 'echu', depuis: date };
}

/** La date telle qu'elle se lit dans une phrase française. */
export function dateLisible(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * La date telle que `<input type="date">` l'exige — `AAAA-MM-JJ`.
 *
 * ⚠ PAS `toISOString().slice(0, 10)`, et c'est le piège de ce fichier :
 * `toISOString` convertit en UTC. À Ouagadougou (UTC+0) l'écart est nul, mais
 * le produit vise l'Afrique de l'Ouest au sens large et un navigateur à
 * UTC+1 rendrait la veille pour toute date à minuit. On lit donc les
 * composantes LOCALES, celles que l'utilisateur voit.
 */
export function pourChampDate(d: Date): string {
  const deuxChiffres = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}
