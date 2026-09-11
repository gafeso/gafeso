/**
 * LA COUCHE 3 — la description d'origine, et le garde qui l'empêche d'être
 * écrasée.
 *
 * CE QU'ELLE EST. Une notice importée d'un système tiers arrive dans un format
 * (MARC21, UNIMARC, demain Dublin Core). Cet original est conservé dans
 * `marcData`, son format déclaré dans `marcFormat`. C'est l'invariant I3 :
 * **ce qui arrive dans un format y reste** — ce qu'on réexporte doit pouvoir
 * être l'original, pas une reconstruction.
 *
 * ⚠ CE QUE LE RELEVÉ P2 A MESURÉ, ET QUI INVERSE LE RISQUE. Sur la base de
 * développement, les 352 notices portent `'{}'` : aucune n'a de description
 * d'origine. On pourrait en conclure que le champ est vide partout et qu'on peut
 * le réécrire librement. **C'est faux, et cette mesure ne dit rien des
 * instances en service** : le chemin d'import écrit `{leader, fields}` avec la
 * description intégrale. Sur une école dont le catalogue a été repris par
 * import, la couche 3 existe DÉJÀ — non déclarée, non exploitée, et ignorée de
 * tous.
 *
 * D'où le principe : on ne décide pas sur une mesure faite ailleurs, on COMPTE
 * À L'EXÉCUTION, sur la donnée qu'on est en train de toucher.
 */

/**
 * Cette valeur porte-t-elle une description d'origine RÉELLE ?
 *
 * ⚠ `{}` et `{"fields": []}` ne comptent PAS : ce sont les deux formes que le
 * produit écrit lui-même pour une notice saisie à la main. Les traiter comme
 * des porteuses bloquerait toute modification de notice ordinaire ; les
 * confondre avec du contenu réel est précisément l'affirmation fausse que le
 * relevé P2 a nommée — « notice MARC vide » là où la vérité est « pas de
 * métadonnées natives ».
 */
export function porteDuNatif(valeur: unknown): boolean {
  if (valeur === null || valeur === undefined) return false;
  if (typeof valeur !== 'object') return false;
  const o = valeur as Record<string, unknown>;
  if (typeof o.leader === 'string' && o.leader.length > 0) return true;
  return Array.isArray(o.fields) && o.fields.length > 0;
}

/** Nombre de zones portées, pour que le refus puisse DIRE ce qu'il protège. */
export function zonesPortees(valeur: unknown): number {
  if (!porteDuNatif(valeur)) return 0;
  const o = valeur as Record<string, unknown>;
  return Array.isArray(o.fields) ? o.fields.length : 0;
}
