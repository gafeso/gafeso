import { UserRole } from '@prisma/client';

/**
 * Catalogue des fonctions (permissions) de la plateforme. Chaque endpoint
 * protégé exige une fonction via @RequiresFunctions ; chaque rôle (table
 * `roles` du schéma tenant) porte la liste des fonctions qu'il accorde.
 * Ajouter une fonction ici = l'exposer au CRUD des rôles et à la garde.
 */
export const FONCTIONS = {
  /** Lire en ligne tous les documents numériques, sans restriction de classe/abonnement. */
  DOCUMENT_LIRE: 'document.lire',
  /** Obtenir une URL de téléchargement d'un fichier numérique (distinct de la lecture). */
  DOCUMENT_TELECHARGER: 'document.telecharger',
  /** Gérer le catalogue : notices, exemplaires, fichiers numériques, catégories, réindexation. */
  CATALOGUE_GERER: 'catalogue.gerer',
  /** Gérer la circulation : prêts, retours, réservations, règles. */
  CIRCULATION_GERER: 'circulation.gerer',
  /** Gérer les adhérents (fiches lecteurs). */
  ADHERENTS_GERER: 'adherents.gerer',
  /** Gérer les classes, niveaux et inscriptions. */
  CLASSES_GERER: 'classes.gerer',
  /** Importer la liste pré-chargée des étudiants attendus (CSV). */
  ETUDIANTS_IMPORTER: 'etudiants.importer',
  /** Consulter la liste des comptes de l'école. */
  COMPTES_VOIR: 'comptes.voir',
  /** Activer les comptes en attente (file d'attente). */
  COMPTES_ACTIVER: 'comptes.activer',
  /** Gérer les comptes : création du personnel, suspension, assignation de rôle. */
  COMPTES_GERER: 'comptes.gerer',
  /** Gérer les collections et leurs règles d'accès (classe/abonnement). */
  COLLECTIONS_GERER: 'collections.gerer',
  /** Créer/modifier/supprimer les rôles et leurs fonctions. */
  ROLES_GERER: 'roles.gerer',
  /** Modifier l'identité visuelle de l'école (couleurs, logo). */
  ETABLISSEMENT_GERER: 'etablissement.gerer',
} as const;

export type Fonction = (typeof FONCTIONS)[keyof typeof FONCTIONS];

/** Toutes les fonctions connues (validation des DTOs, rôle Administrateur). */
export const TOUTES_LES_FONCTIONS: string[] = Object.values(FONCTIONS);

/** Libellés français — exposés par GET /roles/fonctions pour construire une UI. */
export const CATALOGUE_FONCTIONS: { code: Fonction; libelle: string }[] = [
  { code: FONCTIONS.DOCUMENT_LIRE, libelle: 'Lire tous les documents en ligne' },
  { code: FONCTIONS.DOCUMENT_TELECHARGER, libelle: 'Télécharger les fichiers numériques' },
  { code: FONCTIONS.CATALOGUE_GERER, libelle: 'Gérer le catalogue' },
  { code: FONCTIONS.CIRCULATION_GERER, libelle: 'Gérer la circulation (prêts/retours)' },
  { code: FONCTIONS.ADHERENTS_GERER, libelle: 'Gérer les adhérents' },
  { code: FONCTIONS.CLASSES_GERER, libelle: 'Gérer les classes et inscriptions' },
  { code: FONCTIONS.ETUDIANTS_IMPORTER, libelle: 'Importer la liste des étudiants' },
  { code: FONCTIONS.COMPTES_VOIR, libelle: 'Consulter les comptes' },
  { code: FONCTIONS.COMPTES_ACTIVER, libelle: 'Activer les comptes en attente' },
  { code: FONCTIONS.COMPTES_GERER, libelle: 'Gérer les comptes et assigner les rôles' },
  { code: FONCTIONS.COLLECTIONS_GERER, libelle: 'Gérer les collections et règles d’accès' },
  { code: FONCTIONS.ROLES_GERER, libelle: 'Gérer les rôles et leurs fonctions' },
  { code: FONCTIONS.ETABLISSEMENT_GERER, libelle: 'Modifier l’identité visuelle de l’école' },
];

export interface SystemRoleDefinition {
  name: string;
  description: string;
  /** Rôle enum historique équivalent (repli quand users.role_id est null). */
  legacyRole: UserRole;
  functions: string[];
}

/**
 * Rôles système, seedés dans chaque école (non modifiables/supprimables).
 * Leurs fonctions sont la source de vérité du repli historique : un compte
 * sans rôle dynamique assigné hérite des fonctions du rôle système
 * correspondant à son enum.
 */
export const ROLES_SYSTEME: SystemRoleDefinition[] = [
  {
    name: 'Étudiant',
    description:
      'Accès au catalogue et à la lecture en ligne selon sa classe et son abonnement.',
    legacyRole: UserRole.STUDENT,
    functions: [],
  },
  {
    name: 'Bibliothécaire',
    description:
      'Gère le catalogue, la circulation et les adhérents. Lit tous les documents en ligne, ne les télécharge pas.',
    legacyRole: UserRole.LIBRARIAN,
    functions: [
      FONCTIONS.DOCUMENT_LIRE,
      FONCTIONS.CATALOGUE_GERER,
      FONCTIONS.CIRCULATION_GERER,
      FONCTIONS.ADHERENTS_GERER,
    ],
  },
  {
    name: 'Gestionnaire',
    description:
      'Gère les inscriptions : import des étudiants attendus, activation des comptes, classes.',
    legacyRole: UserRole.MANAGER,
    functions: [
      FONCTIONS.DOCUMENT_LIRE,
      FONCTIONS.ETUDIANTS_IMPORTER,
      FONCTIONS.COMPTES_VOIR,
      FONCTIONS.COMPTES_ACTIVER,
      FONCTIONS.CLASSES_GERER,
    ],
  },
  {
    name: 'Acquisitions',
    description: 'Consulte les documents en ligne pour préparer les acquisitions.',
    legacyRole: UserRole.ACQUISITIONS,
    functions: [FONCTIONS.DOCUMENT_LIRE],
  },
  {
    name: 'Administrateur',
    description: 'Toutes les fonctions, y compris le téléchargement des fichiers.',
    legacyRole: UserRole.ADMIN,
    functions: TOUTES_LES_FONCTIONS,
  },
];

/** Fonctions du repli historique pour un enum de rôle (fail-closed : inconnu = aucune). */
export function functionsForLegacyRole(role: string): string[] {
  return ROLES_SYSTEME.find((r) => r.legacyRole === role)?.functions ?? [];
}
