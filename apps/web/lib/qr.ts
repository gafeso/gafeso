import { encode } from 'uqr';

/**
 * LE QR CODE, CALCULÉ LOCALEMENT — zéro requête.
 *
 * ## ⚠ POURQUOI `uqr` ET PAS `qrcode`, QUI EST DÉJÀ AU DÉPÔT
 *
 * `qrcode@1.5.4` est une dépendance DIRECTE d'`apps/api` (TOTP de la double
 * authentification, QR d'inscription). « Choisir une bibliothèque déjà
 * présente » est la bonne règle, et je l'ai écartée sur une MESURE, pas sur un
 * goût — bundles navigateur minifiés puis gzippés :
 *
 * | bibliothèque | gzip | tient dans la marge de la fiche (7 563 o) ? |
 * |---|---|---|
 * | `qrcode` (entrée `browser`) | 9 445 o | 🔴 non — elle la dépasse |
 * | `qrcode-generator` | 7 968 o | 🔴 à peine, puis plus rien |
 * | **`uqr@0.1.3`** | **4 482 o** | ✅ 3 081 o de reste |
 *
 * ⚠ Et son entrée principale ne se bundle MÊME PAS pour le navigateur :
 * `qrcode` tire `pngjs`, qui exige `util` de Node. Elle a bien un champ
 * `browser`, mais elle reste faite pour écrire des PNG côté serveur.
 *
 * Les deux restent donc au dépôt, pour deux runtimes différents — et c'est
 * écrit ici pour que la seconde ne soit pas prise pour un doublon à fondre.
 *
 * `uqr` rend une MATRICE de booléens : on dessine le SVG soi-même, ce qui évite
 * un second paquet de rendu et donne le contrôle nécessaire à l'impression.
 */

/**
 * LA ZONE DE SILENCE : **quatre modules**, et c'est la norme — pas un choix.
 *
 * ⚠⚠ ET `uqr` EN MET UN SEUL PAR DÉFAUT. Mesuré, pas lu dans sa
 * documentation : `encode('x')` rend `size: 23` pour une version 1, là où la
 * norme donne `4 × 1 + 17 = 21`. Les deux modules d'écart sont une bordure de
 * 1 de chaque côté, comptée DANS `size`.
 *
 * ⭐ Une zone de silence de 1 produit un QR qui se scanne MAL — et c'est le
 * genre de défaut qui ne se voit pas à l'écran, seulement devant un téléphone,
 * c'est-à-dire chez le lecteur. On demande donc `border: 0` et on pose les
 * QUATRE modules soi-même.
 */
export const SILENCE = 4;

export interface Matrice {
  /** Le côté, en modules. Vaut toujours `4 × version + 17`. */
  taille: number;
  version: number;
  /** `true` = module sombre. */
  modules: boolean[][];
}

export function matriceQr(texte: string): Matrice {
  // ⚠ `border: 0` — on veut la matrice NUE. Le défaut d'`uqr` est 1, et il
  // entre dans `size` : la garder ferait mentir `4 × version + 17`, et surtout
  // elle remplacerait la zone de silence normative par un quart de celle-ci.
  const r = encode(texte, { ecc: 'M', border: 0 });
  return { taille: r.size, version: r.version, modules: r.data as boolean[][] };
}

/**
 * Le tracé SVG des modules sombres, **runs horizontaux FONDUS**.
 *
 * ⚠ C'est une économie d'octets qui compte, parce que ce tracé part dans le
 * HTML de la fiche — une page du budget public. Un `<rect>` par module
 * donnerait, pour une version 3, jusqu'à 1 089 éléments ; un seul `<path>` où
 * les modules voisins se fondent en `h n` en donne un.
 *
 * Les coordonnées sont en MODULES : c'est le `viewBox` qui met à l'échelle,
 * donc le tracé est le même à 80 px et à 300 px — et il n'y a rien à
 * recalculer pour l'impression.
 */
export function traceDesModules(m: Matrice, silence = SILENCE): string {
  const parties: string[] = [];
  for (let y = 0; y < m.taille; y++) {
    let x = 0;
    while (x < m.taille) {
      if (!m.modules[y][x]) {
        x++;
        continue;
      }
      let fin = x;
      while (fin + 1 < m.taille && m.modules[y][fin + 1]) fin++;
      const n = fin - x + 1;
      parties.push(`M${x + silence} ${y + silence}h${n}v1h-${n}z`);
      x = fin + 1;
    }
  }
  return parties.join('');
}

/** Le côté du `viewBox`, zone de silence comprise. */
export const coteAvecSilence = (m: Matrice, silence = SILENCE) => m.taille + silence * 2;

/* ────────────── LES INVARIANTS DE LA NORME, pour les gardes ────────────── */

/**
 * ⚠ CE QU'UN TEST PEUT PROUVER, ET CE QU'IL NE PEUT PAS.
 *
 * Aucun test de ce dépôt ne peut affirmer qu'un TÉLÉPHONE lit ce QR : il
 * faudrait une caméra. Ce qu'on peut affirmer, et qui tombe si le rendu ou la
 * matrice se dégradent, ce sont les invariants STRUCTURELS d'ISO/IEC 18004 —
 * ils ne dépendent pas de `uqr` et se vérifient sur la matrice seule.
 *
 * ⭐ C'est le même partage que partout ici : on mesure ce qui est mesurable, et
 * on DÉCLARE la borne au lieu de laisser croire qu'elle est couverte. La
 * lecture par un appareil réel appartient à la recette.
 */

/** Un motif de recherche : anneau sombre 7×7, anneau clair, cœur sombre 3×3. */
export function motifDeRecherche(m: Matrice, ox: number, oy: number): boolean {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const bord = x === 0 || y === 0 || x === 6 || y === 6;
      const coeur = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      const attendu = bord || coeur;
      if (m.modules[oy + y][ox + x] !== attendu) return false;
    }
  }
  return true;
}

/** Les trois motifs de recherche, aux trois coins que la norme impose. */
export function lesTroisMotifs(m: Matrice): boolean {
  return (
    motifDeRecherche(m, 0, 0) &&
    motifDeRecherche(m, m.taille - 7, 0) &&
    motifDeRecherche(m, 0, m.taille - 7)
  );
}

/**
 * Les motifs de SYNCHRONISATION : la ligne 6 et la colonne 6 alternent, et
 * elles commencent SOMBRE à l'indice 8.
 */
export function synchronisationAlternee(m: Matrice): boolean {
  for (let i = 8; i < m.taille - 8; i++) {
    const sombre = i % 2 === 0;
    if (m.modules[6][i] !== sombre) return false;
    if (m.modules[i][6] !== sombre) return false;
  }
  return true;
}

/** Le module sombre obligatoire, en `(8, 4 × version + 9)`. */
export const moduleSombreObligatoire = (m: Matrice) => m.modules[4 * m.version + 9][8];
