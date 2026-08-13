/**
 * Catalogue des actions journalisées (audit). Le code d'action est stable
 * (filtre de l'écran de consultation) ; le libellé est pour l'UI.
 */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  TWO_FACTOR_FAILURE: 'auth.2fa.failure',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGE: 'account.password.change',
  ROLE_CREATE: 'role.create',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',
  ACCOUNT_ACTIVATE: 'account.activate',
  ACCOUNT_ROLE_CHANGE: 'account.role_change',
  ACCOUNT_STATUS_CHANGE: 'account.status_change',
  ACCOUNT_DELETE: 'account.delete',
  // Consultation du lien de définition de mot de passe par un gestionnaire.
  // Ce lien permet de PRENDRE LA MAIN sur le compte : sa consultation est donc
  // tracée nominativement, au même titre qu'un changement de rôle.
  ACCOUNT_PASSWORD_LINK_VIEW: 'account.password_link.view',
  RECORD_DELETE: 'record.delete',
  CATEGORY_DELETE: 'category.delete',
  AUTHOR_RENAME: 'author.rename',
  AUTHOR_MERGE: 'author.merge',
  AUTHOR_DELETE: 'author.delete',
  HOMEPAGE_UPDATE: 'homepage.update',
  REMINDER_CONFIG_UPDATE: 'reminder.config.update',
  LOAN_RENEW_ONLINE: 'loan.renew.online',
  CIRCULATION_POLICY_UPDATE: 'circulation.policy.update',
  TWO_FACTOR_ENABLE: 'account.2fa.enable',
  TWO_FACTOR_DISABLE: 'account.2fa.disable',
  TWO_FACTOR_BACKUP_REGEN: 'account.2fa.backup_regenerate',
  ADMIN_API: 'admin.api',
  INVENTORY_MARK_MISSING: 'inventory.mark_missing',
  OFFLINE_DEVICE_REGISTER: 'offline.device.register',
  OFFLINE_LICENSE_ISSUE: 'offline.license.issue',
  OFFLINE_LICENSE_REVOKE: 'offline.license.revoke',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Libellés français des actions — exposés à l'écran de consultation. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.LOGIN_SUCCESS]: 'Connexion réussie',
  [AUDIT_ACTIONS.LOGIN_FAILURE]: 'Échec de connexion',
  [AUDIT_ACTIONS.TWO_FACTOR_FAILURE]: 'Échec du second facteur',
  [AUDIT_ACTIONS.LOGOUT]: 'Déconnexion',
  [AUDIT_ACTIONS.PASSWORD_CHANGE]: 'Changement de mot de passe',
  [AUDIT_ACTIONS.ROLE_CREATE]: 'Création de rôle',
  [AUDIT_ACTIONS.ROLE_UPDATE]: 'Modification de rôle',
  [AUDIT_ACTIONS.ROLE_DELETE]: 'Suppression de rôle',
  [AUDIT_ACTIONS.ACCOUNT_ACTIVATE]: 'Activation de compte',
  [AUDIT_ACTIONS.ACCOUNT_ROLE_CHANGE]: 'Changement de rôle d’un compte',
  [AUDIT_ACTIONS.ACCOUNT_STATUS_CHANGE]: 'Changement de statut d’un compte',
  [AUDIT_ACTIONS.ACCOUNT_DELETE]: 'Suppression de compte',
  [AUDIT_ACTIONS.ACCOUNT_PASSWORD_LINK_VIEW]:
    'Consultation du lien de définition de mot de passe',
  [AUDIT_ACTIONS.RECORD_DELETE]: 'Suppression de notice',
  [AUDIT_ACTIONS.CATEGORY_DELETE]: 'Suppression de catégorie',
  [AUDIT_ACTIONS.AUTHOR_RENAME]: 'Renommage d’une fiche auteur',
  [AUDIT_ACTIONS.AUTHOR_MERGE]: 'Fusion de fiches auteur',
  [AUDIT_ACTIONS.AUTHOR_DELETE]: 'Suppression d’une fiche auteur',
  [AUDIT_ACTIONS.HOMEPAGE_UPDATE]: 'Modification de la page d’accueil',
  [AUDIT_ACTIONS.REMINDER_CONFIG_UPDATE]: 'Modification des notifications de circulation',
  [AUDIT_ACTIONS.LOAN_RENEW_ONLINE]: 'Renouvellement en ligne d’un prêt',
  [AUDIT_ACTIONS.CIRCULATION_POLICY_UPDATE]: 'Modification de la politique de circulation en ligne',
  [AUDIT_ACTIONS.TWO_FACTOR_ENABLE]: 'Activation de la double authentification',
  [AUDIT_ACTIONS.TWO_FACTOR_DISABLE]: 'Désactivation de la double authentification',
  [AUDIT_ACTIONS.TWO_FACTOR_BACKUP_REGEN]: 'Régénération des codes de secours',
  [AUDIT_ACTIONS.ADMIN_API]: 'Action plateforme (clé API admin)',
  [AUDIT_ACTIONS.INVENTORY_MARK_MISSING]: 'Marquage d’exemplaires manquants (récolement)',
  [AUDIT_ACTIONS.OFFLINE_DEVICE_REGISTER]: 'Enregistrement d’un appareil (lecture hors-ligne)',
  [AUDIT_ACTIONS.OFFLINE_LICENSE_ISSUE]: 'Émission d’une licence hors-ligne',
  [AUDIT_ACTIONS.OFFLINE_LICENSE_REVOKE]: 'Révocation d’une licence hors-ligne',
};

/** Une entrée d'audit à écrire. Tous les champs d'acteur/cible sont optionnels. */
export interface AuditEntry {
  tenantId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}
