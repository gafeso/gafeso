/**
 * Le nom de l'adhérent et celui de son compte lié diffèrent-ils ?
 *
 * POURQUOI CE SIGNAL EXISTE. Le nom d'un adhérent est recopié depuis le compte
 * au moment du lien, puis il appartient à l'adhérent — la bibliothécaire peut le
 * corriger, ce qu'elle ne pourrait pas faire sur un compte (`comptes.gerer` est
 * à l'Administrateur seul). C'est donc un INSTANTANÉ : si le compte est corrigé
 * plus tard, les deux noms divergent.
 *
 * ⚠ ET C'EST EXACTEMENT LA DÉRIVE QU'ON A DÉJÀ PAYÉE AILLEURS. `author` et
 * `contributors` portent la même information sur une notice, avec une règle de
 * préséance et un recalcul à quatre endroits — et il existe une requête de
 * rattrapage parce qu'ils peuvent quand même se désaccorder, sans que rien ne
 * le signale. Deux sources sans alerte, c'est une dérive silencieuse. Ici le
 * désaccord est DIT.
 *
 * ⚠ CE SIGNAL NE DÉCIDE RIEN. Il ne corrige pas, ne bloque pas, n'alerte pas :
 * il informe. Une bibliothécaire n'a pas besoin d'un avertissement sur chaque
 * ligne de sa liste ; elle a besoin de pouvoir le voir quand elle regarde une
 * fiche. C'est au front d'en décider, pas à l'API.
 *
 * Les deux noms sont DÉJÀ dans la réponse — celui de l'adhérent sur la ligne,
 * celui du compte dans `user`. On n'ajoute donc que le signal, pas une
 * troisième copie du nom.
 */
export interface AvecNomEtCompte {
  firstName: string | null;
  lastName: string | null;
  user?: { firstName: string; lastName: string } | null;
}

function normaliser(v: string | null | undefined): string {
  return (v ?? '').trim().toLocaleLowerCase('fr');
}

export function nomsDivergents(patron: AvecNomEtCompte): boolean {
  // Pas de compte lié : rien à comparer, donc aucun désaccord.
  if (!patron.user) return false;
  // Adhérent sans nom : le compte est la seule source, pas un désaccord.
  if (!patron.firstName && !patron.lastName) return false;
  return (
    normaliser(patron.firstName) !== normaliser(patron.user.firstName) ||
    normaliser(patron.lastName) !== normaliser(patron.user.lastName)
  );
}
