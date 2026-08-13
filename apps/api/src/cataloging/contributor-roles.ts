/**
 * Rôles de contributeur d'une notice (cahier fiche de saisie §2.2).
 * String validé côté serveur (IsIn) plutôt qu'enum Postgres : la responsable
 * a annoncé de futurs rôles (« traducteur », « préfacier »…) — les ajouter
 * ici suffit, sans migration ni synchronisation de schéma tenant.
 */
export const CONTRIBUTOR_ROLES = [
  'AUTEUR_PRINCIPAL',
  'AUTEUR_SECONDAIRE',
  'DIRECTEUR_MEMOIRE', // libellé UI : « Directeur de mémoire / de thèse »
] as const;

export type ContributorRole = (typeof CONTRIBUTOR_ROLES)[number];
