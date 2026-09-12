/**
 * LA HIÉRARCHIE DES COLLECTIONS — vocabulaire et bornes. P6-1.
 *
 * Faculté → Département → Type de document. C'est l'arborescence réelle d'une
 * université, et c'est la parité DSpace (communauté → sous-communauté →
 * collection).
 */

/**
 * Profondeur maximale, racine comprise.
 *
 * ⚠ LE CHIFFRE SE DÉFEND, il n'est pas arbitraire : c'est exactement
 * l'arborescence réelle (Faculté → Département → Type), c'est la parité DSpace,
 * et au-delà de trois niveaux la profondeur devient un classement que seul son
 * auteur comprend — une hiérarchie que personne ne navigue est une hiérarchie
 * qui ne sert à rien.
 *
 * ⚠ IL EST ÉCRIT À DEUX ENDROITS : ici et dans le trigger PostgreSQL de la
 * migration `collections_hierarchie`. `hierarchie.spec.ts` vérifie qu'ils
 * s'accordent, en lisant le SQL — deux endroits, une seule valeur, et la
 * divergence est impossible en silence.
 */
export const PROFONDEUR_MAX = 3;

/**
 * POURQUOI LES DEUX PROPRIÉTÉS SONT GARANTIES EN BASE, pas ici.
 *
 * « Aucun cycle » et « profondeur ≤ 3 » portent sur un CHEMIN, pas sur une
 * ligne : les vérifier demande de remonter les ancêtres. Un `CHECK` PostgreSQL
 * ne peut contenir ni sous-requête ni CTE récursive — il ne voit que la ligne
 * courante. Un trigger `BEFORE` est donc la seule forme déclarative possible.
 *
 * Et le choix de la base plutôt que de l'application est délibéré : la table
 * est écrite par l'API, mais aussi par le seed, par une reprise de données, et
 * demain par un import. Une validation applicative ne couvre que le premier.
 */

/**
 * Un nœud tel qu'on a besoin de le connaître pour raisonner sur l'arbre.
 *
 * `tenantId` est FACULTATIF ici parce que les calculs de forme (profondeur,
 * hauteur) n'en ont pas besoin. Le refus de déplacement, lui, l'exige — voir
 * `refusDeDeplacement`.
 */
export interface NoeudCollection {
  id: string;
  parentId: string | null;
  /** École propriétaire ; `null` pour une collection PARTAGÉE (commerciale, externe). */
  tenantId?: string | null;
}

/**
 * Hauteur du sous-arbre enraciné en `id` — 1 pour une feuille.
 *
 * ⚠ C'EST LA SEULE DES TROIS PROPRIÉTÉS QUE LE TRIGGER NE PEUT PAS GARANTIR,
 * et elle est écrite ici plutôt que taire.
 *
 * Le trigger valide la ligne ÉCRITE : il remonte ses ancêtres. Déplacer une
 * collection qui a DÉJÀ des enfants peut donc porter tout un sous-arbre au-delà
 * de trois niveaux sans qu'aucune ligne ne viole la règle à son propre niveau —
 * la ligne déplacée est à trois, ses enfants à quatre, et le trigger ne les
 * regarde pas puisqu'ils ne sont pas écrits.
 *
 * D'où cette fonction, appelée AVANT l'écriture par le service.
 */
export function hauteurDuSousArbre(noeuds: NoeudCollection[], id: string): number {
  const enfantsPar = new Map<string, string[]>();
  for (const n of noeuds) {
    if (n.parentId === null) continue;
    const liste = enfantsPar.get(n.parentId) ?? [];
    liste.push(n.id);
    enfantsPar.set(n.parentId, liste);
  }

  // ⚠ Parcours ITÉRATIF avec garde de visite : un arbre cyclique ne peut plus
  // exister en base (le trigger le refuse), mais cette fonction ne le suppose
  // pas — une récursion naïve boucherait à l'infini sur une donnée reprise
  // d'ailleurs, et un calcul de garde-fou ne doit pas pouvoir pendre.
  let hauteur = 0;
  let niveau = [id];
  const vus = new Set<string>();
  while (niveau.length > 0 && hauteur <= noeuds.length) {
    hauteur += 1;
    const suivant: string[] = [];
    for (const courant of niveau) {
      if (vus.has(courant)) continue;
      vus.add(courant);
      suivant.push(...(enfantsPar.get(courant) ?? []));
    }
    niveau = suivant;
  }
  return hauteur;
}

/** Profondeur de `id` depuis sa racine — 1 pour une racine. */
export function profondeurDe(noeuds: NoeudCollection[], id: string): number {
  const parentPar = new Map(noeuds.map((n) => [n.id, n.parentId]));
  let profondeur = 1;
  let courant = parentPar.get(id) ?? null;
  const vus = new Set<string>([id]);
  while (courant !== null && !vus.has(courant) && profondeur <= noeuds.length) {
    vus.add(courant);
    profondeur += 1;
    courant = parentPar.get(courant) ?? null;
  }
  return profondeur;
}

/**
 * Le déplacement de `id` sous `nouveauParent` est-il acceptable ?
 *
 * Rend `null` si oui, sinon le message FRANÇAIS du refus — le service le
 * transforme en 400. Les trois refus sont ceux que le trigger prononcerait,
 * plus celui qu'il ne peut pas voir (la hauteur du sous-arbre déplacé).
 *
 * ⚠ CE N'EST PAS UNE DUPLICATION INUTILE DU TRIGGER. Le trigger est le garde
 * de dernier recours, commun à tous les écrivains ; cette fonction existe pour
 * que l'API réponde un 400 explicable au lieu de laisser remonter une erreur
 * PostgreSQL — et pour couvrir le cas du sous-arbre, que le trigger ignore.
 */
export function refusDeDeplacement(
  noeuds: NoeudCollection[],
  id: string,
  nouveauParent: string | null,
): string | null {
  if (nouveauParent === null) return null; // remonter en racine est toujours permis
  if (nouveauParent === id) {
    return 'Une collection ne peut pas être sa propre parente.';
  }
  const parent = noeuds.find((n) => n.id === nouveauParent);
  if (!parent) {
    return 'La collection parente indiquée n’existe pas.';
  }

  // ⚠ UN ARBRE NE TRAVERSE PAS DEUX ÉTABLISSEMENTS. Décision du 12 septembre
  // 2026, et le motif n'est pas la restriction d'un geste voulu : c'est la
  // fermeture d'un geste que personne n'a décidé d'autoriser.
  //
  // La hiérarchie vit dans la table PUBLIQUE `collections` : rien n'empêchait
  // structurellement de placer la collection de l'école A sous celle de
  // l'école B. Ce n'est pas une fuite aujourd'hui — l'accès se décide par
  // collection, et les règles portent leur `tenantId`. Mais un arbre incohérent
  // qu'on peut construire finira construit, et le jour où quelqu'un ajoutera
  // l'héritage sans relire la décision qui l'interdit, il DEVIENDRA une fuite.
  //
  // ⚠ LE REFUS NOMME SA CAUSE. Un 400 muet enverrait chercher une faute de
  // saisie dans un identifiant parfaitement valide.
  const enfant = noeuds.find((n) => n.id === id);
  if (
    parent.tenantId != null &&
    enfant?.tenantId != null &&
    parent.tenantId !== enfant.tenantId
  ) {
    return 'Cette collection parente appartient à un autre établissement.';
  }

  // Le nouveau parent est-il un descendant de `id` ? Alors c'est un cycle.
  const sousArbre = new Set<string>();
  let niveau = [id];
  while (niveau.length > 0) {
    const suivant: string[] = [];
    for (const courant of niveau) {
      if (sousArbre.has(courant)) continue;
      sousArbre.add(courant);
      suivant.push(...noeuds.filter((n) => n.parentId === courant).map((n) => n.id));
    }
    niveau = suivant;
  }
  if (sousArbre.has(nouveauParent)) {
    return 'Cette collection est déjà une ancêtre de la collection parente choisie.';
  }

  const profondeurFuture = profondeurDe(noeuds, nouveauParent) + 1;
  const hauteur = hauteurDuSousArbre(noeuds, id);
  if (profondeurFuture + hauteur - 1 > PROFONDEUR_MAX) {
    return `La hiérarchie des collections est limitée à ${PROFONDEUR_MAX} niveaux.`;
  }
  return null;
}
