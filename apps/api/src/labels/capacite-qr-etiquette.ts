import * as QRCode from 'qrcode';
import {
  VERSION_MAX_ETIQUETTE,
  adresseGraveeSurEtiquette,
} from '../opac/identifiant-perenne';

/**
 * ⭐⭐ COMBIEN DE CARACTÈRES TIENNENT DANS LE QR D'UNE ÉTIQUETTE — DEMANDÉ À
 * L'ENCODEUR, JAMAIS TRANSCRIT D'UNE TABLE.
 *
 * *Posé le 3 novembre 2026. C'est la BORNE DU SLUG, due depuis quatre lots.*
 *
 * ## Pourquoi le slug a une borne, et pourquoi elle n'est pas « 16 »
 *
 * L'étiquette grave `<ORIGINE>/P/OAI:<SLUG>:<UUID>` dans un carré de côté FIXE
 * — `QR_COTE_MM`, lui-même dérivé de `VERSION_MAX_ETIQUETTE`. Une adresse plus
 * longue ne fait pas un plus grand carré : elle fait monter la VERSION du QR,
 * donc des modules plus petits dans le même carré. Au-delà de
 * `VERSION_MAX_ETIQUETTE`, les modules passent sous
 * `LARGEUR_MODULE_MIN_MM` et **le QR imprimé cesse d'être lisible** — sans
 * qu'aucun code n'échoue, et sans que personne le voie avant d'avoir une
 * planche imprimée sous les yeux.
 *
 * ⚠ La borne n'est donc PAS un nombre de caractères choisi. C'est ce qui reste
 * de la capacité du QR une fois retirés l'origine, le schéma et l'UUID.
 *
 * ## ⭐ LA CAPACITÉ EST MESURÉE, PAS LUE
 *
 * Recopier « version 7, niveau H, alphanumérique → 122 caractères » d'une table
 * de la norme ferait une SECONDE SOURCE, qui se tromperait le jour où
 * `errorCorrectionLevel` change dans `label-pdf.ts`. On interroge donc
 * `QRCode.create` lui-même, par recherche dichotomique, et on garde la plus
 * grande longueur dont la version reste ≤ `VERSION_MAX_ETIQUETTE`.
 *
 * Mesuré ici : **93 caractères**, et c'est bien plus bas que la table ne le
 * laisse croire — parce que le niveau de correction est `H`, le plus coûteux
 * (« une étiquette se salit », dit `label-pdf.ts`).
 *
 * ## ⚠ CE QUE ÇA DONNE, ET C'EST INCONFORTABLE
 *
 * | origine | slug maximal |
 * |---|---|
 * | `https://a.bf` (12) | 37 |
 * | `https://bib.uo.bf` (17) | 32 |
 * | `https://bibliotheque.universite-exemple.edu.bf` (46) | **3** |
 *
 * Une école sur un domaine long n'a presque plus de place pour son slug. Le
 * dire au provisionnement — quand le slug se choisit encore — est tout l'objet
 * de ce fichier : découvrir cette borne en imprimant une planche serait la
 * découvrir trop tard.
 */

/** Le niveau de correction du QR d'étiquette. Doit suivre `label-pdf.ts`. */
export const NIVEAU_CORRECTION_ETIQUETTE = 'H' as const;

/**
 * ⚠ ALPHABET ALPHANUMÉRIQUE DU QR, et le choix compte : l'adresse gravée est
 * mise en CAPITALES précisément pour tenir dans ce mode, qui ne connaît pas les
 * minuscules. Sonder avec un caractère hors de cet alphabet basculerait
 * l'encodeur en mode OCTET et mesurerait une capacité plus petite que la vraie.
 */
const CARACTERE_SONDE = 'A';

let capaciteMemoisee: number | null = null;

/**
 * La plus grande longueur alphanumérique dont le QR reste en version
 * `VERSION_MAX_ETIQUETTE`. Mesurée une fois, par dichotomie sur l'encodeur.
 */
export function capaciteAlphanumEtiquette(): number {
  if (capaciteMemoisee !== null) return capaciteMemoisee;
  const tient = (n: number): boolean => {
    try {
      return (
        QRCode.create(CARACTERE_SONDE.repeat(n), {
          errorCorrectionLevel: NIVEAU_CORRECTION_ETIQUETTE,
        }).version <= VERSION_MAX_ETIQUETTE
      );
    } catch {
      // L'encodeur refuse au-delà de ses capacités : c'est un « ne tient pas ».
      return false;
    }
  };
  // ⚠ Dichotomie entre une borne qui TIENT et une qui ne tient pas, toutes deux
  // vérifiées : partir d'un haut supposé valide ferait mesurer une hypothèse.
  if (!tient(1)) throw new Error('capacité QR nulle : VERSION_MAX_ETIQUETTE est-elle sensée ?');
  let bas = 1;
  let haut = 2;
  while (tient(haut)) {
    bas = haut;
    haut *= 2;
    if (haut > 10_000) throw new Error('capacité QR non bornée : la sonde ne mesure rien');
  }
  while (haut - bas > 1) {
    const milieu = Math.floor((bas + haut) / 2);
    if (tient(milieu)) bas = milieu;
    else haut = milieu;
  }
  capaciteMemoisee = bas;
  return bas;
}

/**
 * ⭐ LA BORNE DU SLUG, pour l'origine que cette installation gravera vraiment.
 *
 * Rend `null` quand l'adresse gravée n'existe pas (pas d'`APP_URL`) : il n'y a
 * alors aucune étiquette à imprimer, donc aucune borne à faire respecter — et
 * inventer un nombre serait refuser des slugs pour une raison inexistante.
 */
export function longueurSlugMaxPourEtiquette(
  appUrl: string,
  domainePrincipal: string | null,
): number | null {
  // ⚠ ON MESURE L'ENCOMBREMENT AVEC LE VRAI PRODUCTEUR. Recomposer
  // « origine + /p/oai: + : + 36 » ici serait une seconde implémentation de
  // l'adresse gravée — la faute que `adresseGraveeSurEtiquette` existe pour
  // empêcher, et qui se tromperait dès que la forme du chemin bouge.
  const SONDE_SLUG = 'sonde';
  const UUID_SONDE = '00000000-0000-4000-8000-000000000000';
  const adresse = adresseGraveeSurEtiquette(appUrl, domainePrincipal, UUID_SONDE, SONDE_SLUG);
  if (!adresse) return null;
  const encombrement = adresse.length - SONDE_SLUG.length;
  return Math.max(0, capaciteAlphanumEtiquette() - encombrement);
}
