/**
 * L'IDENTIFIANT PÉRENNE D'UNE NOTICE — P7-2.
 *
 * ⚠ IL EXISTAIT DÉJÀ, ET ON N'EN INVENTE PAS UN SECOND. `oai:<slug>:<uuid>`
 * est publié depuis P4-3 dans les en-têtes OAI et dans `dc:identifier` : des
 * moissonneurs extérieurs l'ont peut-être déjà stocké. Lui substituer une forme
 * neuve (`gafeso:…`) casserait ces références pour un gain nul — et « deux
 * vocabulaires pour une même chose » est la faute qu'on répare partout
 * ailleurs.
 *
 * Ce fichier ne CHANGE donc pas l'identifiant : il le rend RÉSOLVABLE, et il
 * devient la source unique de sa construction, que trois endroits écrivaient à
 * la main.
 *
 * ## Pourquoi cette forme tient les deux contraintes du brief
 *
 * | Contrainte | Ce qui la tient |
 * |---|---|
 * | il ne change JAMAIS, même si la notice change de collection ou de titre | il ne porte que `BiblioRecord.id`, qui ne change jamais (I1) |
 * | il reste valide si l'établissement change de DOMAINE | ⚠ aucun domaine n'y figure |
 *
 * ⚠ CETTE SECONDE CONTRAINTE EST CELLE QUI ÉCARTE L'URL COMME IDENTIFIANT.
 * Une URL est une ADRESSE : elle dit où trouver, aujourd'hui. Un identifiant
 * dit QUOI, pour toujours. Les confondre, c'est ce qui fait que la moitié des
 * liens d'un catalogue meurent après un déménagement de serveur. On expose donc
 * les DEUX, en les distinguant : l'identifiant, et la localisation courante.
 *
 * ⚠ ET IL N'Y A AUCUNE COLONNE. L'identifiant est une FONCTION de (slug, id) —
 * deux valeurs qui ne changent pas. Le stocker créerait une colonne à écrire, à
 * migrer, et qui pourrait diverger de ce qu'elle est censée dériver. Une valeur
 * dérivable qu'on stocke est une seconde vérité en attente.
 */

/** Le préfixe, imposé par OAI-PMH : un identifiant d'entrepôt est un URI `oai:`. */
const SCHEMA = 'oai';

/** `oai:<slug>:<uuid>` — la forme publiée depuis P4-3. */
export function construireIdentifiant(slug: string, recordId: string): string {
  return `${SCHEMA}:${slug}:${recordId}`;
}

/**
 * Décompose un identifiant. `null` s'il n'a pas la forme attendue.
 *
 * ⚠ IL NE VÉRIFIE PAS L'ÉCOLE, et c'est délibéré : l'appelant sait de quelle
 * école il parle, et les deux erreurs ne se disent pas pareil. « Cet
 * identifiant n'a pas la bonne forme » et « cet identifiant appartient à une
 * autre école » sont deux réponses différentes pour qui les reçoit.
 */
export function analyserIdentifiant(identifiant: string): { slug: string; id: string } | null {
  const parts = identifiant.split(':');
  if (parts.length !== 3 || parts[0] !== SCHEMA || !parts[1] || !parts[2]) return null;
  return { slug: parts[1], id: parts[2] };
}

/**
 * LA LOCALISATION COURANTE — une URL, donc une chose périssable par nature.
 *
 * ⚠ ELLE N'EST PAS L'IDENTIFIANT. Elle dit où trouver la notice AUJOURD'HUI ;
 * elle changera si l'établissement change de domaine, et c'est normal.
 * L'identifiant, lui, ne bougera pas — c'est toute la raison de les distinguer,
 * et c'est ce qui empêche un catalogue de perdre la moitié de ses liens après
 * une migration de serveur.
 *
 * ⚠ ELLE EST BÂTIE SUR L'ORIGINE DE L'ENTREPÔT, celle que le moissonneur vient
 * d'employer pour nous parler — la seule qu'on sache joignable POUR LUI.
 * Deviner le domaine public de l'établissement produirait un lien mort publié à
 * l'extérieur, et un lien mort publié est archivé par des tiers : il ne se
 * reprend pas.
 *
 * Rend `null` si l'origine est illisible : mieux vaut ne rien publier qu'une
 * adresse fabriquée.
 */
export function localisationOai(
  baseUrlDeLEntrepot: string,
  slug: string,
  recordId: string,
): string | null {
  let base: URL;
  try {
    base = new URL(baseUrlDeLEntrepot);
  } catch {
    return null;
  }
  const identifiant = construireIdentifiant(slug, recordId);
  return new URL(`/opac/resoudre/${encodeURIComponent(identifiant)}`, base.origin).toString();
}
