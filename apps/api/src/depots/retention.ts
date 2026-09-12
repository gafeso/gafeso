/**
 * LA RÉTENTION DES FICHIERS DE DÉPÔTS REFUSÉS — backlog n°25.
 *
 * Décision du 12 septembre 2026 : **le fichier d'un dépôt refusé est supprimé
 * au bout de douze mois ; le dépôt et son motif restent.**
 *
 * ⚠ POURQUOI DOUZE ET PAS TROIS, NI TRENTE-SIX. Un étudiant refusé peut
 * redéposer dans l'année — son fichier lui sert encore. Au-delà, personne ne
 * revient, et garder indéfiniment le PDF d'un travail rejeté n'a plus d'objet.
 * Ce n'est pas un réglage : c'est la règle, et elle est écrite ici une fois.
 *
 * ⚠ CE QUI EST SUPPRIMÉ ET CE QUI NE L'EST PAS. Les OCTETS partent — le clair
 * et le chiffré. Le dépôt reste entier : son titre, son auteur, sa date, son
 * directeur, et surtout SON MOTIF DE REFUS. Effacer le motif retirerait à
 * l'étudiant la seule chose qui lui explique pourquoi, et à l'école la seule
 * trace de ce qu'elle a décidé.
 *
 * ⚠ ET LA SUPPRESSION SE TRACE, parce qu'« un fichier qui disparaît sans trace
 * est indistinguable d'un fichier perdu ». Sans journal, une purge réussie et
 * une panne de stockage se ressemblent exactement — et la seconde se corrige,
 * la première non.
 */

/** La règle, en clair. Modifier ce nombre, c'est modifier la politique. */
export const RETENTION_DEPOT_REFUSE_MOIS = 12;

/**
 * La date avant laquelle un refus est assez ancien pour que son fichier parte.
 *
 * ⚠ `maintenant` EST UN PARAMÈTRE, jamais `new Date()` pris à l'intérieur :
 * sans lui, la borne des douze mois n'est éprouvable par aucun test — et une
 * borne de suppression qu'on ne peut pas éprouver est une borne qu'on croit.
 */
export function dateDeButoir(maintenant: Date): Date {
  const butoir = new Date(maintenant);
  butoir.setMonth(butoir.getMonth() - RETENTION_DEPOT_REFUSE_MOIS);
  return butoir;
}

/** Ce qu'il faut savoir d'un dépôt pour décider s'il est purgeable. */
export interface DepotPurgeable {
  status: string;
  decidedAt: Date | null;
  fileKey: string | null;
  encObjectKey: string | null;
}

/**
 * LA DÉCISION, pure.
 *
 * ⚠ BORNE STRICTE, et dans le sens qui protège : un refus prononcé EXACTEMENT
 * à la date de butoir n'est pas encore purgé. Entre garder un jour de trop et
 * supprimer un jour trop tôt, une suppression ne se reprend pas.
 */
export function fichierAPurger(depot: DepotPurgeable, maintenant: Date): boolean {
  if (depot.status !== 'refuse') return false;
  if (!depot.decidedAt) return false;
  if (!depot.fileKey && !depot.encObjectKey) return false;
  return depot.decidedAt < dateDeButoir(maintenant);
}

/**
 * Un dépôt dont le fichier a été purgé — état DÉRIVÉ, pas une colonne.
 *
 * ⚠ POURQUOI DÉRIVÉ. Distinguer « ce dépôt n'a jamais eu de document » de
 * « son document a été supprimé » est nécessaire : sans la distinction,
 * l'écran dirait d'un travail rendu qu'il n'a rien rendu. Une colonne
 * `filePurgedAt` serait plus lisible — c'est une modification de schéma, donc
 * réservée. En attendant, `fileName` est CONSERVÉ pendant que `fileKey` est
 * effacé : le dépôt se souvient du nom du document qu'il portait, et cette
 * asymétrie est exactement l'information.
 */
export function fichierPurge(depot: { fileKey: string | null; fileName: string | null }): boolean {
  return depot.fileKey === null && depot.fileName !== null;
}
