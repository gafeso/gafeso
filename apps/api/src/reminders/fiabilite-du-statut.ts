/**
 * LA COUPURE DE FIABILITÉ DU STATUT D'ENVOI — backlog n°26.
 *
 * Jusqu'au 12 septembre 2026 à 09:31 UTC (commit `e3c913e`),
 * `MailService.send()` sortait NORMALEMENT lorsqu'aucun transport SMTP n'était
 * configuré : une commodité de développement, et un retour normal veut dire
 * « fait » pour tout appelant. Le moteur de rappels écrivait alors
 * `status: 'SENT'` en base — puis l'affichait en statistiques.
 *
 * ⚠ CES LIGNES NE SONT PAS RATTRAPABLES, et la décision est de ne pas essayer.
 * Savoir si un rappel est réellement parti demanderait de savoir si un
 * transport existait à cet instant-là : rien ne l'a enregistré, ni en base, ni
 * dans le journal applicatif. Un rattrapage inventé serait pire que l'aveu —
 * il rendrait le faux indiscernable du vrai, alors qu'aujourd'hui seule la date
 * les sépare.
 *
 * ⚠ CE QU'ON FAIT À LA PLACE : on marque la coupure. « Une donnée fausse dont
 * on sait qu'elle est fausse vaut mieux qu'une donnée fausse qu'on croit
 * vraie. » Un `SENT` d'avant cette date ne dit pas « non envoyé » — il dit
 * « invérifiable », ce qui est la seule chose exacte.
 *
 * ⚠ DÉRIVÉ D'UNE DATE, PAS D'UNE COLONNE. Une colonne exigerait une migration
 * et un rattrapage de masse sur l'historique — c'est-à-dire réécrire des
 * lignes pour dire qu'on ne sait pas ce qu'elles valent. La date est fixe, elle
 * ne bougera jamais, et elle vit à un seul endroit.
 */
export const DATE_CORRECTIF_STATUT_ENVOI = new Date('2026-09-12T09:31:20Z');

/**
 * Le statut de cette ligne est-il le résultat d'une MESURE ?
 *
 * ⚠ Borne inclusive : une ligne écrite à la seconde du correctif l'a été par le
 * code corrigé. Elle est fiable.
 */
export function statutFiable(ecriteLe: Date): boolean {
  return ecriteLe >= DATE_CORRECTIF_STATUT_ENVOI;
}
