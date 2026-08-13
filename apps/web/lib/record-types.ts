// Types de documents et affichage conditionnel du formulaire de saisie
// (cahier fiche de saisie §3) : les champs d'édition (éditeur, ville) ne
// concernent que les ouvrages/publications, les champs de soutenance
// (directeur, université, lieu, année de soutenance) que les travaux
// universitaires soutenus (mémoire, thèse, licence, master, thèse unique).
//
// ⚠ Les valeurs (`value`) doivent rester alignées avec la liste serveur
// DEFENSE_RECORD_TYPES (apps/api/src/cataloging/cataloging.service.ts) — la
// validation de vérité est côté serveur (recordType est une String validée).
export const RECORD_TYPES = [
  { value: 'ouvrage', label: 'Ouvrage' },
  { value: 'these', label: 'Thèse' },
  { value: 'memoire', label: 'Mémoire' },
  { value: 'licence', label: 'Licence' },
  { value: 'master', label: 'Master' },
  { value: 'these_unique', label: 'Thèse unique' },
  { value: 'publication', label: 'Publication' },
];

// Types déclenchant les champs de soutenance (directeur + université + lieu +
// année de soutenance). Source unique pour toute l'application front.
const DEFENSE_TYPES = new Set(['these', 'memoire', 'licence', 'master', 'these_unique']);

/** Travail universitaire soutenu : champs de soutenance affichés et exigés (§4.3). */
export function isDefenseType(recordType: string): boolean {
  return DEFENSE_TYPES.has(recordType);
}

/** Le champ année générique (publishYear) change de libellé selon le type. */
export function yearLabel(recordType: string): string {
  return isDefenseType(recordType) ? 'Année de soutenance' : 'Année de publication';
}
