/**
 * L'ADRESSE PUBLIQUE D'UNE NOTICE — dérivée de l'origine, et voici pourquoi.
 *
 * ## ⚠ `publicUrl` N'EST PAS SERVI, MESURÉ AVANT D'ÉCRIRE UNE LIGNE
 *
 * Le lot demandait « le QR code de `publicUrl` ». `GET /opac/records/:id` ne
 * sert PAS ce champ — relevé le 11 octobre 2026, trente et une clés, pas
 * celle-là. Plutôt que de bâtir sur une supposition, on suit la convention que
 * le produit applique DÉJÀ.
 *
 * ⭐ Et le produit a une réponse : `OaiController.baseUrl()` construit l'adresse
 * publique de l'entrepôt depuis `x-forwarded-host`, sinon `Host` — c'est-à-dire
 * depuis LA REQUÊTE. Côté navigateur, l'équivalent exact est
 * `window.location.origin`. L'adresse publique d'une notice, c'est l'adresse de
 * la page où on la regarde.
 *
 * ⚠ SA BORNE, ET ELLE EST RÉELLE : une affiche imprimée depuis une adresse
 * INTERNE (un `localhost`, une IP de réseau local, un domaine d'essai)
 * encoderait cette adresse-là, et le QR serait inutilisable dehors.
 *
 * ⭐ CE QUI LA RATTRAPE EST DANS LE LOT LUI-MÊME : « adresse en clair sous le
 * QR ». Un humain voit alors ce que le QR contient avant de coller l'affiche
 * dans un couloir. C'est la raison pour laquelle cette exigence n'est pas
 * décorative, et pourquoi le composant ne l'affiche jamais à la place de
 * l'appelant.
 *
 * ⚠ Le jour où l'API servira `publicUrl`, c'est elle qu'il faudra lire : elle
 * seule connaît le domaine PUBLIC d'une école quand on l'atteint autrement.
 * Noté en passation.
 */
export function urlPubliqueDeNotice(id: string, origine?: string): string {
  const base = origine ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/opac/${id}`;
}

/**
 * Le lien d'ouverture dans l'application mobile.
 *
 * ⚠ L'URL publique est passée ENCODÉE : elle contient `://` et des `/`, qui
 * couperaient le paramètre. Et c'est l'adresse WEB qu'on transporte, pas
 * l'identifiant — l'application peut ainsi retomber sur la page si elle ne sait
 * pas traiter le lien.
 */
export const lienApplication = (urlPublique: string) =>
  `gafeso://notice?url=${encodeURIComponent(urlPublique)}`;
