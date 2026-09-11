import {
  DEFAULT_DESCRIPTION_PROFILE,
  DEFENSE_RECORD_TYPES,
  DescriptionProfile,
} from './description-profiles';
import {
  CHAMPS_PROFIL_ACADEMIQUE,
  CHAMPS_PROFIL_BIBLIOGRAPHIQUE,
} from './notice-gafeso';

/**
 * P3-2 — LE PROFIL PREND SON SENS. Il ne déplace AUCUN champ.
 *
 * La colonne `biblio_records.profile` existait depuis P0, portait une seule
 * valeur sur 352 notices, et ne pilotait rien. Ce module lui donne deux choses,
 * et rien de plus :
 *
 *   1. une DÉDUCTION — de quel type de document découle quel profil ;
 *   2. une APPARTENANCE — quels champs relèvent de quel profil.
 *
 * ⚠ Ce qu'il ne fait PAS, délibérément : interdire la saisie d'un champ hors
 * profil. Refuser une écriture serait un changement de comportement, et la
 * règle du lot est de déclarer d'abord, déplacer ensuite, avec le filet entre
 * les deux. L'appartenance est déclarée pour que la phase suivante s'appuie sur
 * elle — pas pour être appliquée ici.
 */

/**
 * Les champs propres à chaque profil.
 *
 * ⚠ CES LISTES NE SONT PAS RÉÉCRITES ICI. Elles viennent de `notice-gafeso.ts`,
 * où P2 les a établies. Les recopier aurait créé un troisième endroit où vit le
 * même vocabulaire — la classe de défaut relevée au §2 du relevé, celle où
 * `sync-schema` réussit en silence sur une liste incomplète.
 */
export const CHAMPS_PAR_PROFIL: Record<DescriptionProfile, readonly string[]> = {
  bibliographique: CHAMPS_PROFIL_BIBLIOGRAPHIQUE,
  academique: CHAMPS_PROFIL_ACADEMIQUE,
};

/**
 * De quel type de document découle le profil académique.
 *
 * ⚠ CE N'EST PAS UNE LISTE NOUVELLE : c'est `DEFENSE_RECORD_TYPES`, celle dont
 * `requireDefenseFields` se sert déjà pour exiger l'université de soutenance.
 * En déduire le profil garantit que les deux règles ne peuvent pas diverger :
 * un type qui exige des champs de soutenance est un type de profil académique,
 * par construction et non par coïncidence.
 */
export function profilPourTypeDeNotice(recordType: string): DescriptionProfile {
  return (DEFENSE_RECORD_TYPES as readonly string[]).includes(recordType.trim())
    ? 'academique'
    : DEFAULT_DESCRIPTION_PROFILE;
}
