// Mise en arbre des collections — P6-1, moitié front.
//
// ⚠ L'API REND UNE LISTE PLATE avec un `parentId`, jamais un arbre : la
// hiérarchie se reconstruit ici. Ce fichier ne rend rien — il est séparé de
// l'écran pour être éprouvé sans monter de DOM, comme `lib/navigation.ts`.

/** Ce dont l'arbre a besoin ; l'écran en passe davantage, c'est sans importance. */
export interface NoeudPlat {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Rang<T> {
  noeud: T;
  /** 0 pour une racine. L'API garantit ≤ 2 (profondeur maximale 3). */
  profondeur: number;
}

/**
 * Liste plate → liste ORDONNÉE pour l'affichage, chaque entrée portant sa
 * profondeur.
 *
 * ⚠ LES ORPHELINS REMONTENT EN RACINE, ILS NE DISPARAISSENT PAS. Un `parentId`
 * qui ne correspond à aucune collection visible n'est pas un cas théorique : la
 * liste peut être filtrée par droits, ou la parente avoir été supprimée entre
 * deux chargements. Les laisser tomber ferait disparaître des collections de
 * l'écran sans rien dire — une liste tronquée de plus, et silencieuse.
 */
export function enArbre<T extends NoeudPlat>(plats: T[]): Rang<T>[] {
  const connus = new Set(plats.map((n) => n.id));
  const enfantsPar = new Map<string | null, T[]>();
  for (const n of plats) {
    const cle = n.parentId && connus.has(n.parentId) ? n.parentId : null;
    const liste = enfantsPar.get(cle) ?? [];
    liste.push(n);
    enfantsPar.set(cle, liste);
  }
  for (const liste of enfantsPar.values()) {
    liste.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  const sortie: Rang<T>[] = [];
  const descendre = (parent: string | null, profondeur: number) => {
    for (const noeud of enfantsPar.get(parent) ?? []) {
      sortie.push({ noeud, profondeur });
      descendre(noeud.id, profondeur + 1);
    }
  };
  descendre(null, 0);
  return sortie;
}

/**
 * Une collection est-elle invisible de tous ?
 *
 * ⚠ C'EST LA DÉCISION DE P6-1, ET ELLE SE DIT À L'ÉCRAN. Une sous-collection
 * N'HÉRITE de RIEN : sans règle propre, elle n'est visible de personne, même si
 * sa parente en porte dix. Un administrateur qui pose une règle sur « Faculté de
 * Droit » et croit avoir ouvert ses départements se tromperait en silence — et
 * le silence est ici du côté du produit, pas de l'utilisateur.
 */
export function invisibleDeTous(c: { _count: { accessRules: number } }): boolean {
  return c._count.accessRules === 0;
}
