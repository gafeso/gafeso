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

/**
 * Regroupements proposés au public sur la page d'accueil.
 *
 * ⚠ CE SONT DES VALEURS D'API, pas des libellés : la clé `types` part telle
 * quelle dans `recordType=a,b` (forme multiple livrée le 10 septembre 2026).
 * Les libellés affichés vivent dans lib/libelles.ts — les mêler ferait
 * traduire un contrat.
 *
 * ⚠ Deux groupes de la maquette sont ABSENTS, et c'est mesuré, pas supposé :
 *  - « Périodiques » : aucun `recordType` ne correspond. RECORD_TYPES ne
 *    connaît pas ce type, et l'inventer donnerait un filtre qui ne trouve rien.
 *  - « Documents numériques » : il n'est PAS absent faute de route — depuis le
 *    lot API du 10 septembre 2026, /opac/parcourir le sert, paginé, filtre
 *    `avecFichier` lu en base. Il reste absent d'ICI parce que ce n'est pas un
 *    filtre de RECHERCHE : /opac/search ne peut pas le porter sans que ses
 *    totaux deviennent faux. La page d'accueil l'offre donc comme un PARCOURS,
 *    à côté du formulaire, et non comme une option de ce menu — une option qui
 *    promettrait une recherche restreinte que rien ne sait servir.
 */
export const GROUPES_DE_TYPES = [
  { cle: 'livres', types: ['ouvrage'] },
  // Tous les travaux soutenus, ceux que isDefenseType() reconnaît déjà.
  { cle: 'travaux', types: ['these', 'memoire', 'licence', 'master', 'these_unique'] },
  { cle: 'publications', types: ['publication'] },
] as const;

export type CleGroupe = (typeof GROUPES_DE_TYPES)[number]['cle'];
