/**
 * L'IDENTIFIANT PÉRENNE D'UNE NOTICE — P7-2.
 *
 * ⚠ IL EXISTAIT DÉJÀ, ET ON N'EN INVENTE PAS UN SECOND. `oai:<slug>:<uuid>`
 * est publié depuis P4-3 dans les en-têtes OAI et dans `dc:identifier` : des
 * moissonneurs extérieurs l'ont peut-être déjà stocké. Lui substituer une forme
 * neuve (`gafeso:…`) casserait ces références pour un gain nul — et « deux
 * vocabulaires pour une même chose » est la faute qu'on répare partout
 * ailleurs.
 *
 * Ce fichier ne CHANGE donc pas l'identifiant : il le rend RÉSOLVABLE, et il
 * devient la source unique de sa construction, que trois endroits écrivaient à
 * la main.
 *
 * ## Pourquoi cette forme tient les deux contraintes du brief
 *
 * | Contrainte | Ce qui la tient |
 * |---|---|
 * | il ne change JAMAIS, même si la notice change de collection ou de titre | il ne porte que `BiblioRecord.id`, qui ne change jamais (I1) |
 * | il reste valide si l'établissement change de DOMAINE | ⚠ aucun domaine n'y figure |
 *
 * ⚠ CETTE SECONDE CONTRAINTE EST CELLE QUI ÉCARTE L'URL COMME IDENTIFIANT.
 * Une URL est une ADRESSE : elle dit où trouver, aujourd'hui. Un identifiant
 * dit QUOI, pour toujours. Les confondre, c'est ce qui fait que la moitié des
 * liens d'un catalogue meurent après un déménagement de serveur. On expose donc
 * les DEUX, en les distinguant : l'identifiant, et la localisation courante.
 *
 * ⚠ ET IL N'Y A AUCUNE COLONNE. L'identifiant est une FONCTION de (slug, id) —
 * deux valeurs qui ne changent pas. Le stocker créerait une colonne à écrire, à
 * migrer, et qui pourrait diverger de ce qu'elle est censée dériver. Une valeur
 * dérivable qu'on stocke est une seconde vérité en attente.
 */

/** Le préfixe, imposé par OAI-PMH : un identifiant d'entrepôt est un URI `oai:`. */
const SCHEMA = 'oai';

/** `oai:<slug>:<uuid>` — la forme publiée depuis P4-3. */
export function construireIdentifiant(slug: string, recordId: string): string {
  return `${SCHEMA}:${slug}:${recordId}`;
}

/**
 * Décompose un identifiant. `null` s'il n'a pas la forme attendue.
 *
 * ⚠ IL NE VÉRIFIE PAS L'ÉCOLE, et c'est délibéré : l'appelant sait de quelle
 * école il parle, et les deux erreurs ne se disent pas pareil. « Cet
 * identifiant n'a pas la bonne forme » et « cet identifiant appartient à une
 * autre école » sont deux réponses différentes pour qui les reçoit.
 */
export function analyserIdentifiant(identifiant: string): { slug: string; id: string } | null {
  const parts = identifiant.split(':');
  if (parts.length !== 3 || parts[0] !== SCHEMA || !parts[1] || !parts[2]) return null;
  return { slug: parts[1], id: parts[2] };
}

/**
 * LA LOCALISATION COURANTE — une URL, donc une chose périssable par nature.
 *
 * ⚠ ELLE N'EST PAS L'IDENTIFIANT. Elle dit où trouver la notice AUJOURD'HUI ;
 * elle changera si l'établissement change de domaine, et c'est normal.
 * L'identifiant, lui, ne bougera pas — c'est toute la raison de les distinguer,
 * et c'est ce qui empêche un catalogue de perdre la moitié de ses liens après
 * une migration de serveur.
 *
 * ⚠ ELLE EST BÂTIE SUR L'ORIGINE DE L'ENTREPÔT, celle que le moissonneur vient
 * d'employer pour nous parler — la seule qu'on sache joignable POUR LUI.
 * Deviner le domaine public de l'établissement produirait un lien mort publié à
 * l'extérieur, et un lien mort publié est archivé par des tiers : il ne se
 * reprend pas.
 *
 * Rend `null` si l'origine est illisible : mieux vaut ne rien publier qu'une
 * adresse fabriquée.
 */
export function localisationOai(
  baseUrlDeLEntrepot: string,
  slug: string,
  recordId: string,
): string | null {
  let base: URL;
  try {
    base = new URL(baseUrlDeLEntrepot);
  } catch {
    return null;
  }
  const identifiant = construireIdentifiant(slug, recordId);
  return new URL(`/opac/resoudre/${encodeURIComponent(identifiant)}`, base.origin).toString();
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ⭐ L'ADRESSE PUBLIQUE DE LA NOTICE — celle qu'on imprime dans un QR.
 *
 * ## ⚠ POURQUOI PAS `localisationOai` — elles ne s'adressent pas au même lecteur
 *
 * `localisationOai` bâtit `/opac/resoudre/<identifiant>` sur l'origine de
 * l'ENTREPÔT, pour un moissonneur. C'est juste là-bas, et ça ne l'est pas ici :
 *
 * · elle emploie l'origine par laquelle le moissonneur vient de parler — une
 *   adresse d'API, pas celle qu'un lecteur ouvre ;
 * · elle emploie l'origine par laquelle le moissonneur vient de parler — une
 *   adresse d'API, pas celle qu'un lecteur ouvre.
 *
 * ## ⭐ LE 11 OCTOBRE 2026 : LA BASCULE A EU LIEU, et ce commentaire la racontait
 *
 * Ce bloc disait, le matin : « le WEB NE SERT AUCUNE PAGE `/opac/resoudre/…` —
 * un QR pointant là mènerait à un 404 », et il annonçait la bascule « en une
 * ligne » le jour où la page existerait. **Le front l'a livrée le soir même**,
 * mesurée sans cookie (308 vers `/opac/<id>` sur les deux formes de
 * l'identifiant, 404 sur un identifiant d'une autre école). La bascule est
 * faite.
 *
 * ⚠ ET LE CHEMIN QUI L'A DÉCLENCHÉE N'EST PAS CELUI QU'ON ATTENDAIT : la dette
 * avait été RAPPORTÉE au front plutôt que corrigée ici, et c'est eux qui l'ont
 * soldée. Le mécanisme annoncé était le bon ; l'acteur ne l'était pas. Écrit
 * ici pour que le prochain commentaire de ce genre continue d'être écrit —
 * une prédiction juste sur le mécanisme et fausse sur l'occasion n'est pas une
 * prédiction ratée.
 *
 * 🔴 CE QUI RESTE VRAI, ET QUI DÉCIDAIT : ce QR est IMPRIMÉ SUR UNE ÉTIQUETTE
 * COLLÉE DANS UN LIVRE. Il ne se reprend pas. **Les DEUX adresses sont donc
 * servies pour toujours** — `/opac/<id>` autant que la forme pérenne —, et des
 * gardes l'exigent des deux côtés : `les-deux-formes-restent-servies.spec.ts`
 * ici, `routes-perennes.spec.ts` chez le web.
 *
 * ## ⚠ L'HÔTE EST CELUI DE L'ÉCOLE, pas `APP_URL` tel quel
 *
 * `APP_URL` porte le SCHÉMA et le PORT de l'instance — c'est elle qui dit
 * `https` ou `http://…:3000`, et on ne les devine pas. Mais une instance
 * multi-établissement sert plusieurs domaines : publier l'hôte d'`APP_URL` pour
 * toutes les écoles donnerait à chacune l'adresse d'une autre.
 *
 * On compose donc : le schéma et le port d'`APP_URL`, l'HÔTE du domaine
 * principal de l'école. Sans domaine déclaré, `APP_URL` entière — c'est le cas
 * d'une instance mono-établissement, et c'est alors exact.
 */
export function adressePubliqueDeLaNotice(
  appUrl: string,
  domainePrincipal: string | null,
  recordId: string,
  slug?: string,
): string | null {
  let base: URL;
  try {
    base = new URL(appUrl);
  } catch {
    // ⚠ Rien plutôt qu'une adresse fabriquée : un QR illisible se remarque, un
    // QR qui mène ailleurs ne se remarque jamais.
    return null;
  }
  if (domainePrincipal) {
    const hote = domainePrincipal.trim().toLowerCase();
    // ⚠ On n'accepte QUE ce qui ressemble à un hôte. Une valeur arbitraire en
    // base — un chemin, un espace, un `@` — fabriquerait une URL qui pointe
    // ailleurs, et c'est exactement ce qu'un QR ne doit pas faire.
    if (/^[a-z0-9.-]+$/.test(hote) && !hote.startsWith('.') && !hote.endsWith('.')) {
      base.hostname = hote;
    }
  }
  // ⭐ LA FORME PÉRENNE QUAND ELLE EST RÉSOLVABLE, le repli sinon. Sans slug il
  // n'y a pas d'identifiant à construire — `/opac/<id>` reste valide pour
  // toujours, et le front le VERROUILLE (`routes-perennes.spec.ts`).
  const chemin = slug
    ? `/opac/resoudre/${encodeURIComponent(construireIdentifiant(slug, recordId))}`
    : `/opac/${encodeURIComponent(recordId)}`;
  return new URL(chemin, base).toString();
}

/**
 * Ce qu'une adresse scannée peut être.
 *
 * ⚠ DEUX FORMES DE « AUTRE ÉTABLISSEMENT », et ce n'est pas une redondance :
 * la forme COURTE (`/opac/<id>`) se juge par l'HÔTE scanné, connu tout de
 * suite. La forme PÉRENNE (`/opac/resoudre/<identifiant>`) porte son école
 * dans l'identifiant lui-même (`oai:<slug>:<id>`) — AUCUN hôte n'est connu à
 * ce stade, parce que cette adresse peut avoir été servie depuis l'origine
 * d'un entrepôt OAI, pas d'un domaine d'établissement (voir `localisationOai`).
 * C'est à l'appelant (qui a accès à la base) de résoudre un hôte à afficher.
 */
export type AdresseScannee =
  | { reconnue: true; recordId: string }
  | { reconnue: false; motif: 'illisible' }
  | { reconnue: false; motif: 'autre-etablissement'; hote: string }
  | { reconnue: false; motif: 'autre-etablissement'; slugEtranger: string };

/**
 * ⭐ RECONNAÎT UNE ADRESSE SCANNÉE, et dit POURQUOI quand elle ne l'est pas.
 *
 * ## ⚠ POURQUOI UN TYPE À TROIS BRANCHES, et pas un `string | null`
 *
 * « Un booléen qui refuse détruit le motif à la source — aucun client ne peut
 * le retrouver. » Les deux refus n'appellent pas le même geste :
 *
 * | Le refus | Ce que la personne doit faire |
 * |---|---|
 * | illisible | ce n'est pas un QR Gafeso — rien à faire, elle a scanné autre chose |
 * | autre établissement | changer d'établissement dans l'application |
 *
 * Les confondre enverrait quelqu'un chercher un défaut dans son application
 * alors qu'il tient le livre d'une AUTRE bibliothèque.
 *
 * ## ⚠ LA COMPARAISON PORTE SUR L'HÔTE, et elle est stricte
 *
 * Deux établissements se distinguent par leur domaine. `bib.uo.bf` et
 * `bib.uo.bf.exemple.org` sont deux hôtes DIFFÉRENTS : une comparaison par
 * `endsWith` les confondrait, et c'est exactement la forme qu'un hameçonnage
 * emploie. On compare l'hôte ENTIER, en minuscules.
 *
 * ⚠ Le PORT n'entre pas dans la comparaison : en développement l'application
 * est sur 3000 et l'API sur 4000, et une étiquette imprimée depuis l'une se
 * scanne depuis l'autre. Le port ne distingue pas deux établissements.
 */
/**
 * ⭐⭐ L'ADRESSE COURTE — celle qu'on imprime sur une ÉTIQUETTE, et seulement là.
 *
 * C'est `/opac/<id>`, sans l'identifiant pérenne. Elle n'est pas un repli :
 * c'est un CHOIX, et il est mesuré.
 *
 * ## 🔴 POURQUOI L'ÉTIQUETTE NE PREND PAS LA FORME PÉRENNE
 *
 * Le QR d'étiquette est un carré **FIXE de 13 mm**. Allonger l'adresse ne
 * l'agrandit pas : elle monte en VERSION, donc ses modules rétrécissent dans le
 * même carré. Mesuré le 11 octobre 2026 (`qrcode`, correction M, zone de silence
 * de 4 modules comprise) :
 *
 * | L'adresse | Longueur | Version | Module |
 * |---|---|---|---|
 * | `/opac/<uuid>` | 59 car | v4 | **0,317 mm** |
 * | `/opac/resoudre/oai:<école>:<uuid>` | 79 car | v5 | **0,289 mm** |
 * | école au nom LONG, forme pérenne | 116 car | v7 | **0,245 mm** |
 *
 * ⚠ **ET LA LISIBILITÉ À CES TAILLES N'EST MESURÉE PAR PERSONNE** — ni ici, ni
 * côté front : il faudrait une planche imprimée et un appareil photo. On ne
 * paie donc pas un rétrécissement de 8 à 23 % pour un gain qui n'en est pas un :
 * **les deux adresses résolvent la même notice**, et `/opac/<id>` est servie
 * pour toujours, garde à l'appui des deux côtés.
 *
 * ## ⚠ CE QUI LA DISTINGUE DU SEUIL DU CODE-BARRES, et il faut le dire ici
 *
 * `LARGEUR_MODULE_MIN_MM` (0,25 mm, dans `label-pdf.ts`) borne le module du
 * **CODE 128**, qui dépend de la longueur du CODE-BARRES. Les chiffres
 * ci-dessus sont la densité du **QR**, qui dépend de la longueur de l'URL. Deux
 * grandeurs en millimètres par module, du même ordre, et **ce ne sont pas les
 * mêmes** : allonger l'adresse ne fait PAS abandonner le QR. Confondre les deux
 * a failli produire une fausse alerte le jour de la bascule.
 *
 * ## ⭐ POURQUOI UNE FONCTION NOMMÉE, et pas simplement « omettre le slug »
 *
 * `adressePubliqueDeLaNotice(appUrl, domaine, id)` rend déjà la forme courte
 * quand on ne lui passe pas de slug. **C'était donc juste par ACCIDENT** : le
 * jour où quelqu'un ajoute le slug « pour être cohérent », les étiquettes
 * basculent sur la forme longue sans que rien ne le dise. Une fonction qui PORTE
 * son intention dans son nom rend ce geste visible — et `etiquette-adresse-courte.spec.ts`
 * le refuse.
 */
export function adresseCourteDeLaNotice(
  appUrl: string,
  domainePrincipal: string | null,
  recordId: string,
): string | null {
  // ⚠ Pas de slug : c'est TOUTE la différence, et elle est délibérée.
  return adressePubliqueDeLaNotice(appUrl, domainePrincipal, recordId);
}

/**
 * ⚠ CORRIGÉ le 20 octobre 2026 : cette fonction ne reconnaissait QUE la forme
 * courte (`/opac/<id>`) — mesuré par le mobile contre le serveur réel. La
 * forme PÉRENNE (`/opac/resoudre/<identifiant>`), celle que porte `publicUrl`
 * et donc les affiches et les pages de titre des PDF, rendait « illisible » :
 * notre propre application refusait nos propres QR.
 *
 * ⚠ LES DEUX FORMES NE SE JUGENT PAS PAR LA MÊME AUTORITÉ, et c'est pour ça
 * qu'elles restent deux branches distinctes plutôt qu'un chemin unique
 * normalisé en amont : la forme courte se juge par l'HÔTE scanné (elle ne
 * porte aucun slug) ; la forme pérenne se juge par le SLUG qu'elle porte
 * elle-même (son hôte peut être celui d'un entrepôt OAI, sans rapport avec
 * l'établissement — comparer son hôte serait comparer la mauvaise chose).
 */
export function reconnaitreAdresse(
  url: string,
  hotesDeLEcole: readonly string[],
  slugCourant: string,
): AdresseScannee {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return { reconnue: false, motif: 'illisible' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { reconnue: false, motif: 'illisible' };
  }

  // ⭐ LA FORME PÉRENNE D'ABORD : son slug est l'autorité, jamais l'hôte.
  const resoudre = /^\/opac\/resoudre\/([^/]+)\/?$/.exec(u.pathname);
  if (resoudre?.[1]) {
    const analyse = analyserIdentifiant(decodeURIComponent(resoudre[1]));
    if (!analyse) return { reconnue: false, motif: 'illisible' };
    if (analyse.slug !== slugCourant) {
      return { reconnue: false, motif: 'autre-etablissement', slugEtranger: analyse.slug };
    }
    return { reconnue: true, recordId: analyse.id };
  }

  // ⚠ Le CHEMIN d'abord : une adresse qui n'est pas une fiche de notice n'est
  // pas « d'un autre établissement », elle est illisible — et le dire
  // autrement enverrait quelqu'un changer d'école pour rien.
  const m = /^\/opac\/([^/]+)\/?$/.exec(u.pathname);
  if (!m || !m[1]) return { reconnue: false, motif: 'illisible' };

  const hote = u.hostname.toLowerCase();
  const connus = hotesDeLEcole.map((h) => h.trim().toLowerCase()).filter(Boolean);
  // ⚠ Une école sans domaine déclaré n'a rien à comparer : on ne REFUSE pas
  // pour autant — refuser toutes les adresses sur une instance
  // mono-établissement fermerait la fonction au lieu de la protéger.
  if (connus.length > 0 && !connus.includes(hote)) {
    return { reconnue: false, motif: 'autre-etablissement', hote };
  }
  return { reconnue: true, recordId: decodeURIComponent(m[1]) };
}
