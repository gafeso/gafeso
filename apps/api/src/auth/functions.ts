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
  /** Gérer le catalogue : notices, exemplaires, fichiers numériques, domaines, réindexation. */
  CATALOGUE_GERER: 'catalogue.gerer',
  /** Outils qui opèrent SUR le catalogue : import de notices, récolement, étiquettes. */
  OUTILS_CATALOGUE: 'outils.catalogue',
  /** Gérer les adhérents (fiches lecteurs). */
  ADHERENTS_GERER: 'adherents.gerer',
  /** Consulter les comptes lecteurs de l'école. */
  LECTEURS_VOIR: 'lecteurs.voir',
  /** Gérer les classes, niveaux et inscriptions. */
  LECTEURS_GERER: 'lecteurs.gerer',
  /** Outils qui opèrent SUR les lecteurs : import de la liste des étudiants attendus. */
  OUTILS_LECTEURS: 'outils.lecteurs',
  /** Tenir le guichet : prêts, retours, réservations. */
  CIRCULATION_FAIRE: 'circulation.faire',
  /**
   * Voir qui est en retard, et les rappels. DÉLIBÉRÉMENT distincte de
   * `circulation.faire` : Koha isole `overdues_report` du reste de la
   * circulation, parce que voir qui est en retard ne va pas de soi pour qui
   * tient le guichet. Les fusionner referait en plus petit la faute
   * d'`etablissement.gerer`.
   */
  CIRCULATION_RETARDS: 'circulation.retards',
  /** Activer les comptes en attente (file d'attente). */
  COMPTES_ACTIVER: 'comptes.activer',
  /** Gérer les comptes : création du personnel, suspension, assignation de rôle. */
  COMPTES_GERER: 'comptes.gerer',
  /** Gérer les collections et leurs règles d'accès (classe/abonnement). */
  COLLECTIONS_GERER: 'collections.gerer',
  /** Consulter les statistiques de l'école. */
  STATISTIQUES_VOIR: 'statistiques.voir',
  /** Modifier l'identité visuelle : couleurs, logo, page d'accueil, QR d'inscription. */
  ETABLISSEMENT_APPARENCE: 'etablissement.apparence',
  /** Modifier les règles de prêt de l'établissement. */
  ETABLISSEMENT_REGLES: 'etablissement.regles',
  /** Gérer la diffusion vers l'extérieur (interopérabilité, entrepôt OAI). */
  DIFFUSION_GERER: 'diffusion.gerer',
  /** Créer/modifier/supprimer les rôles et leurs fonctions. RÉSERVÉE À L'ADMINISTRATEUR. */
  SECURITE_ROLES: 'securite.roles',
  /** Consulter le journal d'audit. */
  SECURITE_AUDIT: 'securite.audit',
  /**
   * Politique d'AUTHENTIFICATION de l'établissement (2FA obligatoire).
   *
   * ⚠ POURQUOI ELLE EXISTE. Ce réglage se posait avec `etablissement.apparence`
   * — la permission des couleurs et du logo. Qui pouvait changer une identité
   * visuelle pouvait désactiver la double authentification de tous les comptes
   * privilégiés de l'école. Une élévation de privilège par étiquette.
   *
   * ⚠ ET POURQUOI PAS `securite.roles`. Qui attribue des droits n'est pas
   * nécessairement qui décide de la politique d'authentification : ce sont deux
   * métiers, et les confondre recréerait le défaut sous un autre nom.
   */
  SECURITE_AUTHENTIFICATION: 'securite.authentification',
  /**
   * Activer et désactiver les MODULES de l'établissement (P4).
   *
   * ⚠ Sa condition de déclenchement était écrite dans ce fichier même : « le
   * registre de modules n'existe pas encore, et une case qui n'ouvre aucun
   * écran est une case inerte. Elle viendra avec lui. » P4 est l'événement.
   *
   * Administrateur seul. Éteindre un module retire des écrans à toute l'école :
   * ce n'est pas un réglage, c'est une décision de périmètre.
   */
  MODULES_GERER: 'modules.gerer',
} as const;

/**
 * Fonctions qu'un rôle PERSONNALISÉ ne peut pas recevoir : elles ne vivent que
 * sur le rôle système Administrateur.
 *
 * `securite.roles` ouvre l'écran qui distribue toutes les autres : la donner à
 * un rôle personnalisé permettrait à son porteur de s'attribuer n'importe quoi.
 * C'est le seul verrou qui empêche l'escalade par composition.
 *
 * ⚠ `modules.gerer` A REJOINT CETTE LISTE avec P4-1 (11 septembre 2026). Sa
 * condition de déclenchement — « le registre de modules n'existe pas encore, et
 * une case qui n'ouvre aucun écran est une case inerte » — est atteinte : le
 * registre existe.
 *
 * Elle est réservée pour la MÊME raison que `securite.roles`, et c'est la
 * raison qui compte : elle commande ce que TOUS les autres écrans montrent. La
 * donner à un rôle personnalisé permettrait à son porteur d'éteindre des
 * modules pour toute l'école — donc de retirer des écrans à des gens dont il ne
 * gère pas les droits. Ce n'est pas une escalade de DROITS, c'est une escalade
 * de PÉRIMÈTRE, et elle est aussi large.
 */
export const FONCTIONS_RESERVEES_ADMIN: string[] = ['securite.roles', 'modules.gerer'];

export type Fonction = (typeof FONCTIONS)[keyof typeof FONCTIONS];

/** Toutes les fonctions connues (validation des DTOs, rôle Administrateur). */
export const TOUTES_LES_FONCTIONS: string[] = Object.values(FONCTIONS);

/** Libellés français — exposés par GET /roles/fonctions pour construire une UI. */
/**
 * Libellés français — exposés par GET /roles/fonctions pour construire l'écran
 * des rôles.
 *
 * ⚠ CHAQUE LIBELLÉ NOMME LES ÉCRANS QU'IL OUVRE, et c'est la règle qui empêche
 * la faute de revenir. « Modifier l'identité visuelle de l'école » ouvrait
 * aussi le journal d'audit, les statistiques, les règles de prêt,
 * l'interopérabilité et les rappels — personne ne pouvait le deviner en
 * cochant la case. Si le libellé avait dit « ouvre aussi : Journal d'audit »,
 * personne ne l'aurait cochée par inadvertance.
 *
 * Toute fonction ajoutée ici sans la liste de ses écrans rouvre le défaut.
 */
export const CATALOGUE_FONCTIONS: { code: Fonction; libelle: string }[] = [
  { code: FONCTIONS.DOCUMENT_LIRE, libelle: 'Lire tous les documents en ligne' },
  { code: FONCTIONS.DOCUMENT_TELECHARGER, libelle: 'Télécharger les fichiers numériques' },
  {
    code: FONCTIONS.CATALOGUE_GERER,
    libelle: 'Gérer le catalogue — ouvre : Catalogue, Auteurs, Domaines',
  },
  {
    code: FONCTIONS.OUTILS_CATALOGUE,
    libelle: 'Outils du catalogue — ouvre : Import de notices, Récolement, Étiquettes',
  },
  { code: FONCTIONS.ADHERENTS_GERER, libelle: 'Gérer les adhérents (fiches lecteurs)' },
  { code: FONCTIONS.LECTEURS_VOIR, libelle: 'Consulter les comptes — ouvre : Comptes' },
  {
    code: FONCTIONS.LECTEURS_GERER,
    libelle: 'Gérer les classes et inscriptions — ouvre : Classes',
  },
  {
    code: FONCTIONS.OUTILS_LECTEURS,
    libelle: 'Outils des lecteurs — ouvre : Import des étudiants',
  },
  {
    code: FONCTIONS.CIRCULATION_FAIRE,
    libelle: 'Tenir le guichet : prêts, retours, réservations — ouvre : Guichet',
  },
  {
    code: FONCTIONS.CIRCULATION_RETARDS,
    libelle: 'Voir les retards et les rappels — ouvre : Rappels',
  },
  { code: FONCTIONS.COMPTES_ACTIVER, libelle: 'Activer les comptes en attente' },
  { code: FONCTIONS.COMPTES_GERER, libelle: 'Gérer les comptes et assigner les rôles' },
  {
    code: FONCTIONS.COLLECTIONS_GERER,
    libelle: 'Gérer les collections et règles d’accès — ouvre : Collections',
  },
  {
    code: FONCTIONS.STATISTIQUES_VOIR,
    libelle: 'Consulter les statistiques — ouvre : Statistiques',
  },
  {
    code: FONCTIONS.ETABLISSEMENT_APPARENCE,
    libelle: 'Modifier l’identité visuelle — ouvre : Identité et réglages, Page d’accueil',
  },
  {
    code: FONCTIONS.ETABLISSEMENT_REGLES,
    libelle: 'Modifier les règles de prêt — ouvre : Identité et réglages (règles de prêt)',
  },
  {
    code: FONCTIONS.DIFFUSION_GERER,
    libelle: 'Gérer la diffusion vers l’extérieur — ouvre : Interopérabilité',
  },
  {
    code: FONCTIONS.SECURITE_ROLES,
    libelle: 'Gérer les rôles et leurs fonctions — ouvre : Rôles (Administrateur seul)',
  },
  {
    code: FONCTIONS.SECURITE_AUDIT,
    libelle: 'Consulter le journal d’audit — ouvre : Journal d’audit',
  },
  {
    code: FONCTIONS.MODULES_GERER,
    libelle:
      'Activer et désactiver les modules — ouvre : Administration · Modules',
  },
  {
    code: FONCTIONS.SECURITE_AUTHENTIFICATION,
    libelle:
      'Décider de la politique d’authentification — impose ou lève la double ' +
      'authentification pour tous les comptes privilégiés',
  },
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
    // Image EXACTE de ses anciennes fonctions à travers le découpage :
    // catalogue.gerer -> catalogue.gerer + outils.catalogue,
    // circulation.gerer -> circulation.faire. Rien de plus.
    functions: [
      FONCTIONS.DOCUMENT_LIRE,
      FONCTIONS.CATALOGUE_GERER,
      FONCTIONS.OUTILS_CATALOGUE,
      FONCTIONS.CIRCULATION_FAIRE,
      FONCTIONS.ADHERENTS_GERER,
    ],
  },
  {
    name: 'Gestionnaire',
    description:
      'Gère les inscriptions : import des étudiants attendus, activation des comptes, classes.',
    legacyRole: UserRole.MANAGER,
    // Image EXACTE : etudiants.importer -> outils.lecteurs,
    // comptes.voir -> lecteurs.voir, classes.gerer -> lecteurs.gerer.
    // ⚠ Ce rôle n'est PAS supprimé : le repli de son métier sur le
    // Bibliothécaire est une décision produit distincte, et
    // functionsForLegacyRole étant fail-closed, le supprimer ici retirerait
    // toutes ses fonctions aux comptes MANAGER non réaffectés.
    functions: [
      FONCTIONS.DOCUMENT_LIRE,
      FONCTIONS.OUTILS_LECTEURS,
      FONCTIONS.LECTEURS_VOIR,
      FONCTIONS.COMPTES_ACTIVER,
      FONCTIONS.LECTEURS_GERER,
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
