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

/**
 * Le nom à AFFICHER pour un adhérent — la fiche d'abord, le compte en repli.
 *
 * ⚠ TROIS SITES LE COMPOSAIENT DEPUIS LE COMPTE SEUL (`circulation.service`,
 * `holds.service`, `reminders.service`), et c'était l'inverse de la règle.
 * Celle-ci est écrite dans `PatronsService.createPatron` et motivée par une
 * PERMISSION : corriger un COMPTE exige `comptes.gerer`, réservé à
 * l'Administrateur ; corriger une FICHE exige `adherents.gerer`, que la
 * bibliothécaire porte. **La fiche fait donc autorité** — sans quoi un nom mal
 * orthographié serait incorrigible au comptoir.
 *
 * Ce que le défaut coûtait, mesuré le 16 septembre 2026 : l'onglet
 * Réservations affichait « — » pour **4 réservataires sur 6**, ceux qui n'ont
 * pas de compte. Et une correction faite par la bibliothécaire n'apparaissait
 * nulle part, ce qui contredisait la dette n° 10 du 11 septembre.
 *
 * ⚠ LE REPLI SUR LE COMPTE RESTE NÉCESSAIRE : le DTO exige « un nom OU un
 * compte lié », donc un adhérent peut n'avoir aucun nom propre. Le repli n'est
 * pas une tolérance, c'est la seconde moitié de la règle.
 *
 * @returns le nom, ou `null` si ni la fiche ni le compte n'en portent.
 */
export function nomDeLAdherent(patron: AvecNomEtCompte): string | null {
  // ⚠ Un adhérent peut porter SEULEMENT un prénom, ou seulement un nom : on
  // assemble ce qui existe plutôt que d'exiger les deux.
  const propre = [patron.firstName, patron.lastName]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (propre) return propre;

  const compte = patron.user
    ? [patron.user.firstName, patron.user.lastName]
        .map((v) => (v ?? '').trim())
        .filter(Boolean)
        .join(' ')
    : '';
  return compte || null;
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
