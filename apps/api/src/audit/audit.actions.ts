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
  COLLECTION_RULES_PROPAGATE: 'collection.rules.propagate',
  /**
   * Suppression d'une collection. Tracée même si la collection est vide : elle
   * a pu porter des règles d'accès, et son absence change ce que quelqu'un voit.
   */
  COLLECTION_DELETE: 'collection.delete',
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
  /**
   * Rattachement (ou détachement) d'une fiche d'autorité à un COMPTE — P6-3.
   * Tracé parce qu'il décide de qui pourra produire une pièce justificative
   * d'encadrement à son nom : même famille qu'un changement de rôle.
   */
  AUTHOR_ACCOUNT_LINK: 'author.account_link',
  HOMEPAGE_UPDATE: 'homepage.update',
  REMINDER_CONFIG_UPDATE: 'reminder.config.update',
  LOAN_RENEW_ONLINE: 'loan.renew.online',
  CIRCULATION_POLICY_UPDATE: 'circulation.policy.update',
  // ⚠ POLITIQUE DE L'ÉCOLE, pas enrôlement d'un compte. Les trois actions
  // `account.2fa.*` ci-dessous tracent ce qu'UN utilisateur fait de SA propre
  // double authentification. Celle-ci trace le réglage qui l'IMPOSE à tous les
  // comptes privilégiés de l'établissement — un autre métier, et un autre
  // niveau de gravité : la désactiver retire la 2FA à tous d'un coup.
  TENANT_2FA_POLICY_UPDATE: 'tenant.2fa_policy.update',
  TWO_FACTOR_ENABLE: 'account.2fa.enable',
  TWO_FACTOR_DISABLE: 'account.2fa.disable',
  TWO_FACTOR_BACKUP_REGEN: 'account.2fa.backup_regenerate',
  ADMIN_API: 'admin.api',
  INVENTORY_MARK_MISSING: 'inventory.mark_missing',
  /**
   * Clôture d'un prêt pour PERTE du document. Tracée parce qu'elle met un
   * exemplaire hors du fonds ET fige une amende — deux effets qu'aucune
   * opération de guichet ordinaire ne produit.
   */
  CHECKOUT_CLOSE_LOST: 'checkout.close_lost',
  OFFLINE_DEVICE_REGISTER: 'offline.device.register',
  OFFLINE_LICENSE_ISSUE: 'offline.license.issue',
  OFFLINE_LICENSE_REVOKE: 'offline.license.revoke',
  /**
   * Purge du fichier d'un dépôt refusé, au terme des douze mois de rétention
   * (backlog n°25). Tracée parce qu'« un fichier qui disparaît sans trace est
   * indistinguable d'un fichier perdu » : sans cette ligne, une purge réussie
   * et une panne de stockage se ressemblent exactement.
   */
  DEPOSIT_FILE_PURGE: 'deposit.file.purge',
  /**
   * Réattribution d'un dépôt soumis à un autre directeur. Tracée avec L'ANCIEN
   * et le NOUVEAU : « réattribué » sans dire de qui à qui ne raconte rien, et
   * c'est précisément ce qu'on relit six mois plus tard.
   */
  DEPOSIT_REASSIGN: 'deposit.reassign',

  /**
   * ⚠ DÉCLARER UNE SOURCE DE MOISSONNAGE EST TRACÉ — c'est décider que le
   * serveur appellera une adresse EXTÉRIEURE de façon récurrente, pas saisir
   * une notice. Même famille qu'un changement de réglage.
   */
  HARVEST_SOURCE_CREATE: 'harvest.source.create',
  HARVEST_SOURCE_DELETE: 'harvest.source.delete',
  HARVEST_RUN: 'harvest.run',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Libellés français des actions — exposés à l'écran de consultation. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.LOGIN_SUCCESS]: 'Connexion réussie',
  [AUDIT_ACTIONS.LOGIN_FAILURE]: 'Échec de connexion',
  [AUDIT_ACTIONS.TWO_FACTOR_FAILURE]: 'Échec du second facteur',
  [AUDIT_ACTIONS.LOGOUT]: 'Déconnexion',
  [AUDIT_ACTIONS.PASSWORD_CHANGE]: 'Changement de mot de passe',
  [AUDIT_ACTIONS.COLLECTION_RULES_PROPAGATE]:
    'Propagation des règles d’accès aux sous-collections',
  [AUDIT_ACTIONS.COLLECTION_DELETE]: 'Suppression d’une collection',
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
  [AUDIT_ACTIONS.AUTHOR_ACCOUNT_LINK]: 'Rattachement d’une fiche auteur à un compte',
  [AUDIT_ACTIONS.HOMEPAGE_UPDATE]: 'Modification de la page d’accueil',
  [AUDIT_ACTIONS.REMINDER_CONFIG_UPDATE]: 'Modification des notifications de circulation',
  [AUDIT_ACTIONS.LOAN_RENEW_ONLINE]: 'Renouvellement en ligne d’un prêt',
  [AUDIT_ACTIONS.CIRCULATION_POLICY_UPDATE]: 'Modification de la politique de circulation en ligne',
  [AUDIT_ACTIONS.TENANT_2FA_POLICY_UPDATE]:
    'Modification de la politique de double authentification de l’école',
  [AUDIT_ACTIONS.TWO_FACTOR_ENABLE]: 'Activation de la double authentification',
  [AUDIT_ACTIONS.TWO_FACTOR_DISABLE]: 'Désactivation de la double authentification',
  [AUDIT_ACTIONS.TWO_FACTOR_BACKUP_REGEN]: 'Régénération des codes de secours',
  [AUDIT_ACTIONS.ADMIN_API]: 'Action plateforme (clé API admin)',
  [AUDIT_ACTIONS.CHECKOUT_CLOSE_LOST]: 'Clôture d’un prêt pour perte du document',
  [AUDIT_ACTIONS.INVENTORY_MARK_MISSING]: 'Marquage d’exemplaires manquants (récolement)',
  [AUDIT_ACTIONS.OFFLINE_DEVICE_REGISTER]: 'Enregistrement d’un appareil (lecture hors-ligne)',
  [AUDIT_ACTIONS.OFFLINE_LICENSE_ISSUE]: 'Émission d’une licence hors-ligne',
  [AUDIT_ACTIONS.DEPOSIT_FILE_PURGE]: 'Purge du document d’un dépôt refusé',
  [AUDIT_ACTIONS.DEPOSIT_REASSIGN]: 'Réattribution d’un dépôt à un autre directeur',
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
