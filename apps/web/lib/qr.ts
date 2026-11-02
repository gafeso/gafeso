import { encode } from 'uqr';
import { LARGEUR_MODULE_MIN_MM, QR_COTE_MM, SILENCE } from './code128';

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
export { SILENCE };

/* ──────── LA TAILLE D'UN MODULE IMPRIMÉ, et le seuil du produit ──────── */

/**
 * ⭐⭐ LA GRANDEUR QUI DÉCIDE QU'UN QR D'ÉTIQUETTE EST IMPRIMABLE — et elle ne
 * se devine pas : elle se calcule.
 *
 * Le carré d'une étiquette est FIXE (`QR_COTE_MM`), zone de silence comprise.
 * Plus l'adresse est longue, plus la version monte, plus il y a de modules dans
 * le même carré — donc plus chaque module RÉTRÉCIT. Mesuré le 2 novembre 2026,
 * sur une notice réelle, dans 13 mm :
 *
 * | L'adresse encodée | Car. | Version | Modules + silence | Module |
 * |---|---|---|---|---|
 * | `…/opac/<uuid>` — COURTE | 66 | 5 | 37 + 8 = 45 | **0,2889 mm** |
 * | `…/opac/resoudre/oai:<slug>:<uuid>` | 85 | 6 | 41 + 8 = 49 | **0,2653 mm** |
 * | la même, deux-points PERCENT-ENCODÉS | 89 | 6 | 41 + 8 = 49 | **0,2653 mm** |
 *
 * ⚠ ET LE SEUIL N'EST PAS INVENTÉ ICI. `LARGEUR_MODULE_MIN_MM = 0,25` est la
 * largeur minimale que le produit se donne DÉJÀ pour un code imprimé, et elle
 * est partagée avec le backend. L'appliquer au QR est la même règle, sur l'autre
 * code de la même étiquette.
 *
 * ⚠ LA BORNE, ET ELLE EST RÉELLE : ce seuil dit qu'un module est IMPRIMABLE, pas
 * qu'un téléphone le LIT. La lecture par un appareil demande une planche
 * imprimée et des appareils — elle appartient à la recette, et aucun test de ce
 * dépôt ne peut l'affirmer.
 *
 * ## 🔴 LE CAS QUI CASSE, et il est LÉGAL
 *
 * La borne structurelle : `13 / (taille + 8) ≥ 0,25` ⟺ `taille ≤ 44` ⟺
 * **version ≤ 6**. La version 7 tombe à 0,2453 mm.
 *
 * Or le slug d'une école apparaît DEUX FOIS dans l'adresse pérenne — dans
 * l'hôte ET dans l'identifiant. Mesuré par balayage :
 *
 * | L'écriture | Dernier slug qui tient | Casse à |
 * |---|---|---|
 * | deux-points bruts | **15 caractères** | 16 |
 * | percent-encodée (`%3A`) | **13 caractères** | 14 |
 *
 * ⚠ Et `provision-tenant.dto.ts` autorise **2 à 49 caractères**. Une école au
 * nom long est donc légale, et son étiquette n'est pas imprimable à 13 mm —
 * c'est exactement ce que cette fonction existe pour ATTRAPER, au lieu de
 * dessiner un QR trop fin pour l'imprimante.
 */
export const moduleQrMm = (modules: number, coteMm = QR_COTE_MM) =>
  coteMm / (modules + 2 * SILENCE);

/**
 * ⚠ Le QR est-il assez GROS pour être imprimé ? C'est une question distincte de
 * `qrTient`, qui demande s'il laisse la place au CODE-BARRES. Les deux doivent
 * être vraies, et confondre les deux laisserait passer un cas chacune.
 */
export const qrAssezGros = (modules: number, coteMm = QR_COTE_MM) =>
  moduleQrMm(modules, coteMm) >= LARGEUR_MODULE_MIN_MM;

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
