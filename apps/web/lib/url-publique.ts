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
 * ⭐⭐ CE QUE L'API SERT POUR UNE ÉTIQUETTE — on le LIT, on ne le refait pas.
 *
 * ## ⚠ CE QUE CE BLOC REMPLACE, et pourquoi c'était à remplacer
 *
 * Jusqu'au 3 novembre 2026, ce fichier portait DEUX dérivations locales :
 * `adresseCourtePerenne`, qui recomposait `<origine>/p/<identifiant>`, et
 * `pourLeQrDEtiquette`, qui la passait en capitales. Elles s'accordaient avec
 * celles du backend **parce qu'elles composaient les mêmes parties servies** —
 * pas par construction. C'était le sursis que Jean a nommé : *« deux
 * dérivations qui s'accordent, gardées contre le désaccord. Ce n'est pas la
 * suppression. »*
 *
 * ⭐ `GET /opac/records/:id` sert désormais le bloc entier :
 *
 * ```json
 * "etiquette": { "adresseGravee": "HTTPS://<hôte>/P/OAI:<SLUG>:<UUID>", "coteMm": 14 }
 * ```
 *
 * Mesuré sur le serveur de développement AVANT d'écrire une ligne :
 * `HTTP://LOCALHOST:3005/P/OAI:ZINDA:B2DCAA10-…`, `coteMm` entier à 14.
 *
 * ## ⚠⚠ AUCUN REPLI, MÊME PAS SILENCIEUX
 *
 * Un bloc absent ou mal formé rend **`null`**, et l'étiquette abandonne alors
 * son QR en le DISANT. Recomposer l'adresse ici réintroduirait la seconde
 * dérivation qu'on vient de supprimer ; retomber sur l'ancien côté graverait
 * une géométrie que l'API ne garantit plus. Les deux seraient des divergences
 * qui attendent leur heure.
 *
 * ⭐ Et le côté est **CONSTANT par construction** — précision du backend, qui
 * corrige ce que nous croyions tous les deux : `coteMm` ne dépend PAS du slug.
 * C'est la VERSION du QR qui varie, donc le module. Mesuré : `zinda` → v4,
 * 0,3415 mm ; un slug de 28 caractères → v5, 0,3111 mm — très au-dessus du
 * seuil tous les deux.
 */
export interface EtiquetteServie {
  /** La chaîne EXACTE que le QR doit porter — déjà en capitales. */
  adresseGravee: string;
  /** Le côté du carré en millimètres, dérivé côté API. */
  coteMm: number;
}

/**
 * Le bloc `etiquette` d'une réponse de notice, ou `null`.
 *
 * ⚠ Les deux champs sont validés SÉPARÉMENT : une adresse vide n'est pas une
 * adresse, et un `coteMm` absent, nul ou négatif ne décrit aucun carré. Un bloc
 * à moitié servi rend `null` plutôt qu'une étiquette à moitié juste.
 */
export function etiquetteServie(bloc: unknown): EtiquetteServie | null {
  if (bloc === null || typeof bloc !== 'object') return null;
  const { adresseGravee, coteMm } = bloc as Partial<EtiquetteServie>;
  if (typeof adresseGravee !== 'string' || adresseGravee.trim() === '') return null;
  if (typeof coteMm !== 'number' || !Number.isFinite(coteMm) || coteMm <= 0) return null;
  return { adresseGravee: adresseGravee.trim(), coteMm };
}
