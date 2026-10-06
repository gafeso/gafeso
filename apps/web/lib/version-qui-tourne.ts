/**
 * LA VERSION QUI TOURNE — un seul endroit qui interprète `GET /health`.
 *
 * ## Pourquoi ce fichier, et pas deux lectures
 *
 * Le pied de page PUBLIC est rendu côté serveur ; la coque PROFESSIONNELLE est
 * un composant client. Les deux ont donc besoin d'appeler `/health` par des
 * chemins différents — mais **l'interprétation de la réponse vit ici**, une
 * fois. Deux parsings de la même charge utile divergeraient le jour où le
 * contrat bouge, et c'est « deux sources qui s'accordent par coïncidence ».
 *
 * ## ⚠ CE QU'ON N'AFFICHE PAS
 *
 * `null` quand on ne sait pas, et l'appelant **ne rend rien**. Jamais une
 * version par défaut, jamais « version inconnue » dans un pied de page public :
 * une non-réponse écrite comme un fait est le défaut que ce dépôt traque depuis
 * le 8 septembre, et un numéro inventé enverrait un support lire le mauvais code.
 *
 * ⚠ `commit` vaut `'inconnu'` quand l'environnement du conteneur ne le porte
 * pas — c'est l'API qui le dit, et c'est une RÉPONSE, pas une absence. On le
 * transmet tel quel : il dit au support que l'instance ne sait pas d'où elle
 * vient, ce qui est une information.
 */

/** Ce que le produit sait de lui-même. `null` = on ne sait pas. */
export interface VersionQuiTourne {
  version: string;
  /** `'inconnu'` est une valeur légitime, posée par l'API. */
  commit: string;
}

/**
 * Interprète la charge utile de `GET /health`.
 *
 * ⚠ Exigeante par choix : sans `version` exploitable, on rend `null` plutôt que
 * d'afficher une chaîne vide ou un `undefined`. Le contrat est
 * `{ status, service, version, commit, timestamp }` — voir
 * `apps/api/src/health/version.ts`, qui explique pourquoi la version est lue à
 * l'EXÉCUTION et jamais figée au build.
 */
export function lireVersion(charge: unknown): VersionQuiTourne | null {
  if (typeof charge !== 'object' || charge === null) return null;
  const { version, commit } = charge as { version?: unknown; commit?: unknown };
  if (typeof version !== 'string' || version.trim() === '') return null;
  return {
    version,
    // ⚠ Le commit peut manquer du contrat (une API plus ancienne) : on retombe
    // sur le mot que l'API emploie elle-même, jamais sur une chaîne vide qui
    // s'afficherait comme un trou.
    commit: typeof commit === 'string' && commit.trim() !== '' ? commit : 'inconnu',
  };
}
