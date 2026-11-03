/**
 * ⭐ LA FORME D'UNE ADRESSE ÉLECTRONIQUE — UNE SEULE SOURCE.
 *
 * *Posée le 3 novembre 2026, par le balayage de clôture de la V1.* Ce motif
 * existait en CINQ exemplaires identiques : `accounts.service.ts`,
 * `holds.service.ts`, `oai.controller.ts`, `reminders.service.ts` et
 * `scripts/creer-activite-de-reservation.mjs`.
 *
 * Mesuré au moment du regroupement : **une seule forme distincte**, donc zéro
 * divergence actuelle. Le défaut était LATENT — et c'est le danger de cette
 * famille. Cinq portes qui valident une adresse, et le jour où l'une se
 * resserre, une adresse acceptée à l'inscription est refusée à la relance, ou
 * l'inverse. Aucune erreur ne se lève : un courriel ne part simplement pas.
 *
 * ⚠ CE QU'ELLE NE PRÉTEND PAS ÊTRE. Elle ne valide pas une adresse au sens de
 * la RFC — « il y a un arobase, quelque chose avant, un point après ». C'est
 * délibéré : un motif plus strict refuse des adresses valides, et ce qui
 * tranche réellement est l'ENVOI. Resserrer ce motif pour « mieux valider »
 * est la forme fautive qui attend.
 */
export const FORME_ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
