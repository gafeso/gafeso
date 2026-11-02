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
    /*
     * ⭐⭐ LA REMISE EN MINUSCULES, 2 novembre 2026 — et elle est SANS PERTE.
     *
     * Les étiquettes impriment leur QR en MAJUSCULES depuis ce jour : le mode
     * alphanumérique de la norme QR couvre `0-9 A-Z $%*+-./:` mais PAS les
     * minuscules, et une adresse tout en capitales change de mode et gagne une
     * version entière — 0,3171 mm par module au lieu de 0,2653 pour `zinda`.
     *
     * ⭐ Le résolveur doit donc accepter les DEUX casses, et le faire sans rien
     * perdre. Il le peut : un slug est `[a-z][a-z0-9-]*` (DTO du backend) et un
     * uuid est hexadécimal. `OAI:ZINDA:B2DC…`.toLowerCase() redonne donc
     * EXACTEMENT l'identifiant canonique — vérifié, pas supposé.
     *
     * ⚠ Et la minuscule est la forme CANONIQUE partout ailleurs : les
     * majuscules ne sortent jamais du QR imprimé. `casse-du-qr.spec.tsx` le
     * garde par l'EFFET, en décodant les tracés réellement dessinés.
     */
    return decodeURIComponent(segment).toLowerCase();
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
 * ⭐⭐ L'ADRESSE DU QR D'UNE ÉTIQUETTE — la PÉRENNE, et il n'y a pas de repli.
 *
 * ## ⚠ CE FICHIER A PORTÉ LA DÉCISION INVERSE PENDANT TROIS SEMAINES
 *
 * Du 11 octobre au 2 novembre 2026, l'étiquette portait la forme COURTE
 * (`/opac/<uuid>`), et le motif écrit ici était juste : chaque caractère
 * d'adresse rétrécit les modules d'un carré de 13 mm.
 *
 * **Ce qui manquait n'était pas la mesure, c'était le SEUIL.** On savait que la
 * grandeur décroît ; on ne l'avait pas comparée à la largeur minimale que le
 * produit se donne déjà. Comparée, le 2 novembre 2026 :
 *
 * | L'adresse | Module à 13 mm | ≥ 0,25 mm ? |
 * |---|---|---|
 * | courte | 0,2889 mm | ✓ |
 * | **pérenne** | **0,2653 mm** | **✓** |
 *
 * ⭐ Les deux tiennent. Le rétrécissement était réel et il ne franchissait
 * aucune limite — voir `moduleQrMm` pour la mesure complète et son balayage.
 *
 * ## ⭐ ET LA DÉCISION NE VIENT PAS DE LA MESURE, elle vient du SUPPORT
 *
 * Jean, 2 novembre 2026 : *« ce qui est imprimé sur un support DURABLE doit
 * porter la forme PÉRENNE. La forme courte meurt avec le domaine ; une
 * étiquette collée sur un livre doit survivre à un changement de domaine ou
 * d'hébergeur. »*
 *
 * ⚠ C'est pourquoi cette fonction rend **`null`** plutôt qu'une adresse courte
 * quand le catalogue ne sert rien. Un repli sur la forme courte serait un
 * SECOND MEILLEUR CHOIX là où la décision dit qu'il n'y en a pas — et il
 * produirait, en silence, exactement l'artefact qu'on veut empêcher : un QR
 * périssable collé dans un livre. L'appelant ABANDONNE le QR et le DIT.
 */
export function adressePerenneDuQr(publicUrl: string | null | undefined): string | null {
  // ⚠ Une chaîne vide n'est pas une adresse — même garde qu'`adresseDuQr`.
  const canonique = publicUrl?.trim();
  return canonique ? canonique : null;
}

/**
 * ⭐⭐ LA MISE EN MAJUSCULES — et elle ne sort JAMAIS du QR IMPRIMÉ.
 *
 * ## ⭐ POURQUOI, et le chiffre
 *
 * Le mode ALPHANUMÉRIQUE de la norme QR couvre `0-9`, `A-Z`, l'espace et
 * `$%*+-./:` — **pas les minuscules**, qui forcent le mode octet. Une adresse
 * tout en capitales change donc de mode et gagne une version entière. Mesuré le
 * 2 novembre 2026, carré de 14 mm :
 *
 * | Le contenu | Version | Module |
 * |---|---|---|
 * | `https://zinda.gafeso.org/p/oai:zinda:<uuid>` | 5 | 0,3111 mm |
 * | **la même en MAJUSCULES** | **4** | **0,3415 mm** |
 * | pire cas légal (slug de 49), minuscules | 9 | 🔴 0,2295 mm |
 * | **pire cas légal, MAJUSCULES** | **7** | **0,2642 mm** |
 *
 * ⭐ C'est ce qui permet de garder le slug LIBRE : Jean a refusé qu'une
 * contrainte d'impression décide du nommage d'un établissement — un slug naturel
 * peut faire 26 caractères.
 *
 * ## ⚠⚠ SA BORNE, ET ELLE EST LA MOITIÉ DE LA DÉCISION
 *
 * **Les majuscules ne sortent jamais du QR imprimé.** Ni dans OAI-PMH, ni sur
 * la fiche, ni dans un `aria-label`, ni dans aucune adresse publiée. La forme
 * canonique reste MINUSCULE partout ailleurs — c'est elle que les moissonneurs
 * ont stockée depuis P4-3, et deux représentations d'un identifiant publié
 * divergent le jour où l'une change.
 *
 * ⭐ C'est pourquoi cette fonction est appelée à UN SEUL endroit — le composant
 * d'étiquette, au moment de fabriquer la matrice — et jamais en amont. Un appel
 * en amont contaminerait l'adresse affichée, l'`aria-label`, et tout ce qui
 * dérive de la même valeur.
 *
 * ⚠ `casse-du-qr.spec.tsx` le garde par l'EFFET : il décode les tracés
 * RÉELLEMENT DESSINÉS — celui de l'étiquette et celui de la fiche — et exige
 * que le premier soit en capitales et le second non.
 */
export const pourLeQrDEtiquette = (adresse: string) => adresse.toUpperCase();

/* ──────────── LES DEUX FORMES, RECONNUES — pour les épreuves ──────────── */

/**
 * ⭐ RECONNAÎT LA FORME COURTE : celle qu'une étiquette ne doit plus porter.
 *
 * ⚠ Ces deux prédicats existent pour qu'une épreuve mesure l'EFFET — ce qu'une
 * étiquette encode RÉELLEMENT — et non la forme du code qui le fabrique. Un
 * garde qui relit l'appel ne verrait pas un repli ajouté trois fonctions plus
 * loin ; celui-ci lit l'adresse qui part dans le QR.
 */
export const estFormeCourte = (adresse: string) => /\/opac\/[0-9a-f-]{36}$/i.test(adresse);

/** ⚠ Les DEUX écritures : la session mobile a prouvé que le scanner accepte les
 * deux-points bruts ET percent-encodés, et l'API sert la seconde. */
export const estFormePerenne = (adresse: string) =>
  /(\/opac\/resoudre\/|\/p\/)oai(:|%3A)/i.test(adresse);

/**
 * ⭐⭐ L'ADRESSE QUE LES ÉTIQUETTES IMPRIMENT — la pérenne **COURTE**, en
 * deux-points BRUTS.
 *
 * ## ⭐ DEUX DÉCISIONS DE JEAN, 2 novembre 2026, et chacune a son chiffre
 *
 * **① les deux-points BRUTS, pas le percent-encodé.** La session mobile a
 * prouvé que le scanner accepte les deux formes ; `%3A` coûte 4 caractères pour
 * rien. Mesuré : le slug tenable passe de 13 à 15 caractères.
 *
 * **② une route canonique COURTE**, `/p/<identifiant>`, servie par le web.
 * `/opac/resoudre/…` reste acceptée POUR TOUJOURS — on n'enlève jamais une
 * adresse pérenne, on en ajoute une plus courte.
 *
 * Mesuré le 2 novembre 2026, ECC M, carré de 13 mm, deux-points bruts :
 *
 * | Le gabarit | Slug le plus long qui tient | `zinda` |
 * |---|---|---|
 * | `/opac/resoudre/oai:<s>:<u>` | 15 car. | 85 car., v6, 0,2653 mm |
 * | **`/p/oai:<s>:<u>`** | **21 car.** | **73 car., v5, 0,2889 mm** |
 *
 * ⚠ Le slug apparaît DEUX FOIS — dans l'hôte, puis dans l'identifiant — donc
 * chaque caractère de chemin économisé vaut un demi-caractère de slug.
 *
 * ## ⚠ POURQUOI ON COMPOSE, ET CE QUI VIENT D'OÙ
 *
 * L'API ne connaît pas encore `/p/`. On compose donc le CHEMIN — mais les deux
 * parties viennent d'ELLE :
 *
 * | La partie | Sa source | Pourquoi pas autrement |
 * |---|---|---|
 * | l'origine | `new URL(publicUrl).origin` | jamais celle du navigateur : une impression depuis un poste de développement graverait `localhost` dans un livre |
 * | l'identifiant | `identifiantPerenne`, **verbatim** | le recomposer depuis l'hôte serait une seconde implémentation d'une valeur publiée à des moissonneurs extérieurs |
 *
 * ⚠ Et `encodeURIComponent` n'est PAS appliqué, délibérément : les deux-points
 * sont légaux dans un segment de chemin (RFC 3986, `pchar`), et les encoder
 * annulerait la décision ①. Le résolveur encaisse les deux écritures.
 *
 * ⚠ Rend `null` dès qu'une partie manque — pas de repli sur la forme courte,
 * pour la raison écrite dans `adressePerenneDuQr`.
 */
export function adresseCourtePerenne(
  publicUrl: string | null | undefined,
  identifiantPerenne: string | null | undefined,
): string | null {
  const base = publicUrl?.trim();
  const id = identifiantPerenne?.trim();
  if (!base || !id) return null;
  try {
    return `${new URL(base).origin}/p/${id}`;
  } catch {
    /*
     * ⚠ Une `publicUrl` qui n'est pas une URL analysable ne donne pas d'origine.
     * On rend `null` plutôt qu'une adresse fabriquée : un QR qui mène ailleurs
     * ne se remarque jamais, et celui-ci est collé dans un livre.
     */
    return null;
  }
}
