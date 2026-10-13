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
 * ⭐⭐ L'ADRESSE À METTRE DANS UN QR — `publicUrl` d'ABORD, l'origine ENSUITE.
 *
 * Le backend sert `publicUrl` depuis le 11 octobre 2026, et sa conception
 * RÉSOUT la borne que ce fichier déclarait :
 *
 * · elle vient de `APP_URL` (configuration) + le domaine principal de l'école,
 *   donc de l'adresse CANONIQUE — pas de celle par laquelle on est arrivé ;
 * · et sans `APP_URL` elle vaut **`null`**, parce que « on ne DEVINE pas : une
 *   adresse fabriquée n'en est pas une. Un QR qui mène ailleurs ne se remarque
 *   jamais ». Ce sont leurs mots, et ils ont raison.
 *
 * ⭐ C'est donc elle qu'il faut pour une AFFICHE : une impression faite depuis
 * une adresse interne encodera désormais l'adresse canonique, et non celle du
 * poste. Le repli sur l'origine ne sert plus que l'instance qui n'a pas
 * configuré `APP_URL` — et là, l'origine est la seule adresse qu'on connaisse.
 *
 * ⚠ ET LE REPLI RESTE VISIBLE : l'adresse est affichée EN CLAIR sous le QR dans
 * les deux cas. C'est ce qui permet de voir qu'on a imprimé une adresse de
 * `localhost` avant de coller l'affiche dans un couloir.
 */
export function adresseDuQr(
  id: string,
  publicUrl: string | null | undefined,
  origine?: string,
): string {
  // ⚠ `?.trim()` : une chaîne vide n'est pas une adresse, et elle ne doit pas
  // gagner contre le repli sous prétexte qu'elle est « définie ».
  const canonique = publicUrl?.trim();
  return canonique ? canonique : urlPubliqueDeNotice(id, origine);
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

/**
 * ⭐⭐ RELIRE UN IDENTIFIANT ARRIVÉ PAR UNE ADRESSE IMPRIMÉE.
 *
 * ## ⚠ MON PREMIER COMMENTAIRE AFFIRMAIT L'INVERSE, ET IL N'ÉTAIT PAS MESURÉ
 *
 * La page de résolution portait, le 11 octobre 2026 :
 *
 * > « ⚠ Next décode déjà le segment : l'identifiant arrive avec ses
 * >   deux-points, que le QR les ait portés bruts ou encodés. **Mesuré sur les
 * >   deux formes.** »
 *
 * **C'était faux, et ça n'avait pas été mesuré.** Le segment arrive
 * PERCENT-ENCODÉ. L'`encodeURIComponent` de l'appel à l'API le rencodait donc
 * une seconde fois — `oai%253Azinda%253A…` —, l'API rendait 404, et la page
 * concluait `introuvable` sur un identifiant PARFAITEMENT VALIDE.
 *
 * ⚠ Et ce qui l'a laissé passer est ma propre doublure de test : elle passait
 * la valeur DÉJÀ DÉCODÉE, donc elle confirmait mon hypothèse au lieu de
 * mesurer le produit. Douze cas verts sur un écran qui rendait 404 à tout le
 * monde. C'est « une doublure est une hypothèse, et un test vert ne confirme
 * que moi » — sur l'adresse la plus irréversible du produit, puisqu'elle est
 * COLLÉE DANS DES LIVRES.
 *
 * ## ⭐ CE QUE LA MESURE DIT, et elle simplifie
 *
 * Les DEUX formes qu'un QR peut porter arrivent IDENTIQUES :
 *
 * | Ce que le navigateur demande | Ce que `params` rend |
 * |---|---|
 * | `/opac/resoudre/oai:zinda:<uuid>`     | `oai%3Azinda%3A<uuid>` |
 * | `/opac/resoudre/oai%3Azinda%3A<uuid>` | `oai%3Azinda%3A<uuid>` |
 *
 * Next NORMALISE l'adresse. Il n'y a donc **qu'une seule forme à traiter**, et
 * un seul décodage — pas deux chemins à tenir d'accord.
 */
export function identifiantDuSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    /*
     * ⚠ Un `%` orphelin fait LEVER `decodeURIComponent`. On rend alors le
     * segment BRUT : l'API le refusera proprement, et le visiteur verra le 404
     * explicite. Laisser l'exception passer produirait un 500 — sur une
     * adresse imprimée, c'est-à-dire sur celle qu'on ne peut pas corriger.
     */
    return segment;
  }
}

/**
 * ⭐⭐ L'ADRESSE DU QR D'UNE ÉTIQUETTE — la COURTE, et c'est une décision de Jean.
 *
 * ## ⚠ POURQUOI DEUX ADRESSES, ET LAQUELLE VA OÙ
 *
 * | Le support | L'adresse | Pourquoi |
 * |---|---|---|
 * | affiche A4, bloc « Partager » | `publicUrl` — PÉRENNE | elle survit à un déménagement de serveur, et la place ne manque pas |
 * | **étiquette collée dans un livre** | **`shortUrl` — COURTE** | le QR y est un carré FIXE de 13 mm, et chaque caractère rétrécit ses modules |
 *
 * ⭐ **Le chiffre qui a motivé l'arbitrage**, mesuré le 11 octobre 2026 avant la
 * bascule du backend : dans un carré de 13 mm, zone de silence comprise,
 *
 * | L'adresse | Caractères | Version | Module |
 * |---|---|---|---|
 * | `…/opac/<uuid>` | 72 | 5 | **0,289 mm** |
 * | `…/opac/resoudre/oai:<école>:<uuid>` | 91 | 6 | **0,265 mm** |
 * | école au nom long | 128 | 8 | **0,228 mm** |
 *
 * ⚠ La LISIBILITÉ n'a pas été mesurée — il faudrait une planche imprimée et des
 * téléphones — donc aucun seuil n'est avancé ici. Ce qui est mesuré est que la
 * grandeur DÉCROÎT avec la longueur de l'adresse, et que le carré ne grandit
 * pas. C'est ce qui a fait choisir la forme courte pour l'étiquette.
 *
 * ## 🔴 ET CE QUE LA ROUTE DES ÉTIQUETTES SERT AUJOURD'HUI : RIEN
 *
 * Mesuré par le chemin normal (connexion par le formulaire, 11 octobre 2026) :
 * `GET /cataloging/records/:id` ne porte **ni `shortUrl`, ni `publicUrl`, ni
 * `identifiantPerenne`**. L'écran d'aperçu déclarait pourtant
 * `publicUrl?: string | null` — un champ que la réponse n'a jamais porté, donc
 * un repli qui s'appliquait TOUJOURS en silence.
 *
 * ⚠ Conséquence, et elle est irréversible : le QR d'une étiquette encode
 * l'origine du NAVIGATEUR. Imprimée depuis un hôte de développement, elle colle
 * `http://localhost:3000/...` dans un livre. **L'écran le DIT désormais**, et
 * `shortUrl` est demandé au backend pour cette route (voir `docs/passation.md`).
 */
export function adresseCourteDuQr(
  id: string,
  shortUrl: string | null | undefined,
  origine?: string,
): string {
  // ⚠ Une chaîne vide n'est pas une adresse — même garde que `adresseDuQr`.
  const canonique = shortUrl?.trim();
  return canonique ? canonique : urlPubliqueDeNotice(id, origine);
}

/**
 * ⚠ CE QUI PERMET À L'ÉCRAN DE LE DIRE. Séparé d'`adresseCourteDuQr` exprès :
 * une fonction qui rend une adresse ne peut pas aussi rendre la confiance qu'on
 * lui accorde, et c'est la CONFIANCE qui décide d'un avertissement.
 */
export function adresseCourteEstServie(shortUrl: string | null | undefined): boolean {
  return Boolean(shortUrl?.trim());
}
