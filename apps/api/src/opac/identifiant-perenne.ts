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
 * · et **le WEB NE SERT AUCUNE PAGE `/opac/resoudre/…`** — mesuré le 11 octobre
 *   2026 : `apps/web/app/opac/` porte `page.tsx`, `[id]`, `auteurs`, `lire`, et
 *   rien d'autre. Un QR pointant là mènerait à un 404.
 *
 * 🔴 ET C'EST CE QUI TRANCHE : ce QR est IMPRIMÉ SUR UNE ÉTIQUETTE COLLÉE DANS
 * UN LIVRE. Il ne se reprend pas. Publier une adresse qui ne répond pas
 * aujourd'hui dans l'espoir qu'une page existe demain, c'est coller des liens
 * morts sur un fonds entier.
 *
 * ⚠ Dette RAPPORTÉE au front plutôt que corrigée ici : si
 * `/opac/resoudre/[identifiant]` devient une page web (une simple redirection
 * vers `/opac/<id>` suffit), cette fonction bascule dessus en une ligne — et le
 * QR cesse alors de porter un identifiant de base dans son chemin.
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
  return new URL(`/opac/${encodeURIComponent(recordId)}`, base).toString();
}

/** Ce qu'une adresse scannée peut être. */
export type AdresseScannee =
  | { reconnue: true; recordId: string }
  | { reconnue: false; motif: 'illisible' }
  | { reconnue: false; motif: 'autre-etablissement'; hote: string };

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
export function reconnaitreAdresse(
  url: string,
  hotesDeLEcole: readonly string[],
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
