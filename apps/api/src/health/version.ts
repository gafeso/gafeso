/**
 * LA VERSION QUI TOURNE — l'étiquette git du build, posée au BUILD.
 *
 * ## Pourquoi ce fichier existe
 *
 * Un support qui ne sait pas quelle version tourne chez un client ne peut rien
 * diagnostiquer : il demande de refaire des gestes déjà faits, et il cherche un
 * défaut dans du code que l'instance ne porte pas.
 *
 * ## ⚠ CE FICHIER A ÉTÉ ÉCRIT À L'ENVERS UNE PREMIÈRE FOIS (6 octobre 2026)
 *
 * Sa première version lisait `apps/api/package.json` à l'EXÉCUTION, et son
 * en-tête ARGUMENTAIT CONTRE un build-arg, en citant la leçon d'`API_URL` —
 * figée dans la sortie standalone au moment du build. L'analogie était fausse,
 * et de deux façons :
 *
 *   · `API_URL` est une propriété de DÉPLOIEMENT : la même image peut servir
 *     deux hôtes, donc la figer est un défaut. Une version est une propriété
 *     du BUILD : l'image EST le build, le binaire et l'étiquette sont cuits
 *     ensemble, et aucune dérive n'est possible entre les deux.
 *
 *   · ⭐ Et surtout : `package.json` est TENU À LA MAIN. Il a porté `0.1.0`
 *     pendant 759 commits. Le lire à l'exécution ne disait donc pas « ce que
 *     l'image porte vraiment » — ça rendait un littéral périmé FIDÈLEMENT.
 *     Le dessin rendait le mensonge fidèle.
 *
 *     Mesuré sur mon propre geste, dans la même journée : avoir incrémenté les
 *     trois `package.json` à `1.0.0-rc1` à la main a laissé
 *     `package-lock.json` à `0.1.0`. La dérive a pris quelques minutes.
 *
 * ## LA SOURCE, et il n'y en a qu'une
 *
 * L'étiquette git du commit construit, passée en `ARG` par le script de
 * déploiement (`scripts/version-du-depot.sh`), jamais tapée par quelqu'un.
 * Les trois `package.json` portent désormais `0.0.0-non-publie` : un nombre
 * qui ne prétend rien, et que `version-publiee.spec.ts` refuse de voir changer.
 *
 * ## ⚠ ET SANS ÉTIQUETTE, ON LE DIT
 *
 * Un commit qui n'est pas exactement sur une étiquette n'a pas de version. On
 * rend alors `non étiquetée` — jamais un numéro plausible. Le `commit` reste,
 * lui, et c'est exactement ce qui identifie ce cas-là : un support qui lit
 * « non étiquetée · 4843fff » sait qu'il parle à un build intermédiaire et sait
 * lequel. Un support qui lit « 0.1.0 » cherche dans le mauvais code.
 */

/** Ce que `GET /health` publie, et ce que Swagger annonce. */
export interface VersionPubliee {
  /** L'étiquette git du build (`v1.0.0-rc1`), ou `non étiquetée`. */
  readonly version: string;
  /** Le SHA court du commit construit, ou `inconnu`. */
  readonly commit: string;
}

/** Ce qu'on rend quand l'argument de build n'a pas été posé. */
export const SANS_ETIQUETTE = 'non étiquetée';
export const SANS_COMMIT = 'inconnu';

/**
 * ⚠ Un `ARG` non passé arrive comme chaîne VIDE, pas comme `undefined` — donc
 * un `??` ne suffirait pas et publierait `version: ""`. On borne sur le
 * contenu, jamais sur la présence.
 */
function lire(brut: string | undefined, defaut: string): string {
  const valeur = (brut ?? '').trim();
  return valeur.length > 0 ? valeur : defaut;
}

export const VERSION_PUBLIEE: VersionPubliee = {
  version: lire(process.env.GAFESO_VERSION, SANS_ETIQUETTE),
  commit: lire(process.env.GAFESO_COMMIT, SANS_COMMIT),
};
