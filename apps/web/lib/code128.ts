// @ts-expect-error — `jsbarcode` n'embarque aucune déclaration de types, et son
// encodeur CODE 128 vit dans `bin/` : le paquet n'a AUCUN champ `exports`, donc
// l'import profond est légal. La version est épinglée à l'exact (3.12.3) parce
// qu'un chemin interne n'est pas un contrat — et le témoin ci-dessous le dit.
import { CODE128 } from 'jsbarcode/bin/barcodes/CODE128/index.js';

/**
 * LE CODE-BARRES CODE 128, CALCULÉ LOCALEMENT — zéro requête.
 *
 * ## ⭐ POURQUOI PAS `bwip-js`, QUE LE SERVEUR EMPLOIE DÉJÀ
 *
 * `apps/api/src/labels/label-pdf.ts` fait ses PNG avec `bwip-js` (MIT, déjà au
 * dépôt). Mesuré en bundle navigateur : **262 912 o gzip** — l'intégralité du
 * moteur BWIPP, toutes symbologies confondues. C'est près du double du budget
 * d'une page publique entière.
 *
 * L'encodeur **CODE 128 SEUL** de `jsbarcode` : **2 755 o gzip**. Deux ordres de
 * grandeur, pour la même symbologie.
 *
 * ## ⭐⭐ ET LES DEUX S'ACCORDENT — vérifié, pas supposé
 *
 * Un aperçu qui n'imprimerait pas le même code que le PDF du serveur serait un
 * faux dispositif : on validerait une planche à l'écran et une autre sortirait.
 * Les deux encodeurs ont donc été comparés sur six valeurs de la forme réelle
 * (`BIB-000123`, `ZK-000124`, `A1`, `ZK-X-42`…), par la LARGEUR EN MODULES —
 * une propriété du code, pas du rendu :
 *
 *     BIB-000123   jsbarcode 123 · bwip-js 123 ✅
 *     ZK-000124    jsbarcode 112 · bwip-js 112 ✅
 *     A1           jsbarcode  57 · bwip-js  57 ✅
 *     …            6 comparés · 0 écart
 *
 * ⚠ Ce qui compte dans cet accord n'est pas la largeur : c'est que les deux
 * choisissent les **mêmes sous-ensembles** (B pour « BIB- », C pour les paires
 * de chiffres). Deux encodeurs qui commutent différemment donneraient deux
 * codes valides et DIFFÉRENTS pour la même valeur.
 */

export interface Barres {
  /** `'1'` = barre, `'0'` = espace. Un caractère par module. */
  motif: string;
  /** La valeur encodée, telle qu'elle doit s'imprimer en clair sous les barres. */
  texte: string;
}

export function barresCode128(valeur: string): Barres | null {
  const enc = new CODE128(valeur, {});
  // ⚠ `valid()` AVANT `encode()` : Code 128 n'accepte que l'ASCII imprimable,
  // et un code-barres « encodé » depuis une valeur refusée serait illisible —
  // un faux qui se scanne mal plutôt que pas du tout.
  if (!enc.valid()) return null;
  const { data, text } = enc.encode() as { data: string; text: string };
  return { motif: data, texte: text ?? valeur };
}

/**
 * Le tracé SVG des barres, **runs FONDUS** — même raison que pour le QR : un
 * `<rect>` par module ferait 123 éléments par étiquette, et une planche en
 * porte vingt-quatre.
 *
 * Les coordonnées sont en MODULES : le `viewBox` met à l'échelle, donc le même
 * tracé sert à l'écran et à l'impression.
 */
export function traceDesBarres(motif: string, hauteur = 10): string {
  const parties: string[] = [];
  let x = 0;
  while (x < motif.length) {
    if (motif[x] !== '1') {
      x++;
      continue;
    }
    let fin = x;
    while (fin + 1 < motif.length && motif[fin + 1] === '1') fin++;
    const n = fin - x + 1;
    parties.push(`M${x} 0h${n}v${hauteur}h-${n}z`);
    x = fin + 1;
  }
  return parties.join('');
}

/**
 * ⚠ LA ZONE DE SILENCE D'UN CODE 128 : **dix modules** de chaque côté, et c'est
 * la norme (ISO/IEC 15417). Comme pour le QR, la bibliothèque ne la pose pas —
 * c'est à l'appelant, et l'oublier donne un code que les lecteurs de guichet
 * ratent une fois sur trois au bord de l'étiquette.
 */
export const SILENCE_BARRES = 10;

/* ───────── LA PLACE DU QR SUR UNE ÉTIQUETTE : DEMANDÉE, PAS PRISE ───────── */

/**
 * ⚠⚠ CET INVARIANT VIENT DU BACKEND, ET IL CORRIGE UN DÉFAUT DE CE LOT.
 *
 * `apps/api/src/labels/label-pdf.ts`, 11 octobre 2026 — ⚠ le NOM de l'école est
 * remplacé ici par « une école pilote » : `apps/web` PART au dépôt public, et le
 * garde de publication a refusé l'instantané sur ce mot. Le motif ne perd rien ;
 * c'est le nom du client qui n'a rien à faire dehors.
 *
 * > « Les douchettes en service dans une école pilote lisent le CODE-BARRES.
 * >   Un QR qui le
 * >   rétrécirait sous le seuil de lecture casserait le circuit de prêt d'une
 * >   bibliothèque entière pour un gain d'affichage. »
 *
 * ⭐ **Le code-barres d'abord, le QR si la place reste.** On calcule ce que le
 * motif mesurerait AVEC le QR ; si le module passe sous
 * `LARGEUR_MODULE_MIN_MM`, le QR est ABANDONNÉ pour cette étiquette.
 *
 * ⚠ MON APERÇU NE LE FAISAIT PAS, et il posait le QR à côté du code-barres
 * quoi qu'il arrive. Il montrait donc une étiquette que le PDF n'imprime pas —
 * exactement la divergence que cet aperçu existe pour éviter, et sur la seule
 * propriété qui décide si une planche est utilisable au comptoir.
 *
 * ⚠ ET LA PLANCHE DOIT ÊTRE EN MILLIMÈTRES POUR QUE LA RÈGLE AIT UN SENS. Une
 * grille en colonnes CSS a une largeur qui dépend de la fenêtre : la largeur de
 * module en découlerait, et la décision d'abandon changerait avec la taille du
 * navigateur. Les cotes sont donc celles du PDF, A4 compris.
 *
 * Les valeurs sont celles du backend, et toute divergence est un défaut :
 * `LARGEUR_MODULE_MIN_MM = 0,25` · QR 13 mm · écart 2 mm · A4 210 mm ·
 * marge 7 mm · gouttière 2,5 mm · 3 colonnes.
 */
export const LARGEUR_MODULE_MIN_MM = 0.25;

/**
 * La zone de silence NORMATIVE d'un QR, en modules, de chaque côté.
 *
 * ⚠ Elle vit ICI et non dans `lib/qr.ts` parce que `QR_COTE_MM` en dépend, et
 * qu'une valeur lue à deux endroits finit par divergier — ce dépôt a payé ce
 * motif six fois. `lib/qr.ts` la ré-exporte pour ses appelants.
 */
export const SILENCE = 4;

/**
 * ⭐⭐ LE PIRE CAS QU'UNE ÉTIQUETTE S'ENGAGE À IMPRIMER, en modules.
 *
 * Décision de Jean, 2 novembre 2026 : **le slug reste libre.** « Je refuse
 * qu'une contrainte d'impression décide du nommage d'un établissement — un slug
 * naturel peut faire 26 caractères. »
 *
 * Le pire cas est donc le slug le plus long que
 * `provision-tenant.dto.ts` autorise — **49 caractères** —, dans l'adresse la
 * plus longue qu'on imprime, et le slug y apparaît DEUX FOIS (l'hôte, puis
 * l'identifiant). Mesuré le 2 novembre 2026, contenu en MAJUSCULES, ECC M :
 * 161 caractères → **version 7**, soit `4 × 7 + 17 = 45` modules.
 *
 * ⚠ `etiquettes-cote-derive.spec.ts` le VÉRIFIE en encodant réellement ce pire
 * cas : si une version de plus était nécessaire, il tombe en le disant.
 */
export const VERSION_MAX_ETIQUETTE = 7;
export const MODULES_MAX_ETIQUETTE = 4 * VERSION_MAX_ETIQUETTE + 17 + 2 * SILENCE;

/**
 * ⭐⭐ LE CÔTÉ DU QR D'UNE ÉTIQUETTE — **DÉRIVÉ**, jamais recopié.
 *
 * ## ⚠ IL VALAIT 13, ÉCRIT EN DUR, ET C'ÉTAIT LA MAUVAISE FORME
 *
 * Jusqu'au 2 novembre 2026 : `export const QR_COTE_MM = 13;`. Le nombre était
 * juste pour les adresses d'alors, et **rien ne le reliait au seuil qu'il
 * existe pour respecter.** Le jour où `LARGEUR_MODULE_MIN_MM` monterait, le
 * carré serait resté à 13 et les étiquettes auraient imprimé des modules sous
 * le minimum — en silence, sur des livres.
 *
 * ⭐ Il est donc CALCULÉ : le côté minimal pour que le pire cas tienne encore
 * au seuil, arrondi au millimètre supérieur. `53 × 0,25 = 13,25` → **14 mm**.
 *
 * ⚠ Et l'arrondi n'est pas une coquetterie : il donne la marge qui fait que
 * TOUTES les étiquettes réelles gagnent en robustesse. `zinda` passe de
 * 0,2653 à 0,3171 mm par module — c'est le vrai bénéfice de ce lot, et il vaut
 * pour chaque livre dès demain, pas seulement pour le cas limite.
 *
 * ⚠ LA BORNE GÉOMÉTRIQUE, mesurée : la hauteur d'une étiquette (26 mm) moins le
 * rembourrage laisse **23,00 mm**. `etiquettes-cote-derive.spec.ts` refuse un
 * côté qui la dépasserait — sinon le QR sortirait de l'étiquette sans que
 * personne le voie avant l'impression.
 */
export const QR_COTE_MM = Math.ceil(MODULES_MAX_ETIQUETTE * LARGEUR_MODULE_MIN_MM);
export const QR_ECART_MM = 2;
export interface Planche {
  largeurMm: number;
  margeGaucheMm: number;
  gouttiereMm: number;
  colonnes: number;
  /** Le rembourrage intérieur d'une étiquette, de chaque côté. */
  padMm: number;
}

/**
 * ⚠ PAS `as const` : le nombre de colonnes est CHOISI par la bibliothécaire
 * dans le panneau, et c'est lui qui décide si le QR tient. Un type littéral
 * `colonnes: 3` interdisait de le remplacer — et le compilateur l'a dit.
 */
export const PLANCHE: Planche = {
  largeurMm: 210,
  margeGaucheMm: 7,
  gouttiereMm: 2.5,
  colonnes: 3,
  padMm: 1.5,
};

/** La largeur utile d'une étiquette, en millimètres — cotes du PDF. */
export function largeurEtiquetteMm(p: Planche = PLANCHE): number {
  return (
    (p.largeurMm - 2 * p.margeGaucheMm - (p.colonnes - 1) * p.gouttiereMm) / p.colonnes
  );
}

/**
 * Le QR tient-il SANS rendre le code-barres illisible ?
 *
 * ⚠ `modules` est le nombre de MODULES du motif, pas une largeur en pixels.
 * Le backend a nommé ce piège : confondre les deux donnerait un seuil trois
 * fois trop permissif, « et le défaut ne se verrait qu'à la douchette ».
 */
export function qrTient(modules: number, p: Planche = PLANCHE): boolean {
  const boxPleinMm = largeurEtiquetteMm(p) - 2 * p.padMm;
  const boxAvecQrMm = boxPleinMm - (QR_COTE_MM + QR_ECART_MM);
  if (boxAvecQrMm <= 0) return false;
  return boxAvecQrMm / modules >= LARGEUR_MODULE_MIN_MM;
}
