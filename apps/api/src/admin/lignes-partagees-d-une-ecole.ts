/**
 * ⚠ CE QUE `public` GARDE D'UNE ÉCOLE — et ce que sa suppression doit emporter.
 *
 * *Posé le 14 septembre 2026, après avoir mesuré deux écoles supprimées dont le
 * socle et les règles d'accès étaient restés en base.*
 *
 * ## L'origine du défaut, et elle est mécanique
 *
 * `deprovisionTenant` nettoyait TROIS tables : `domains`, `tenant_settings`,
 * `subscriptions`. Ce sont **exactement** les trois qui portent une clé
 * étrangère `ON DELETE RESTRICT` vers `tenants` — c'est-à-dire les trois que
 * PostgreSQL REFUSAIT de laisser passer.
 *
 * Les cinq autres — collections, règles d'accès, rappels, paiements, audit —
 * ne portent aucune contrainte. Rien ne s'est plaint, rien n'a échoué, et
 * elles sont restées. Le nettoyage n'a jamais été pensé par le DOMAINE : il a
 * été écrit sous la dictée des contraintes, et il s'est arrêté où elles se
 * taisent.
 *
 * Ce que ça laissait derrière, mesuré sur la base de développement : deux
 * collections socles et deux règles d'accès d'écoles disparues — plus, pour
 * toute école ayant servi, ses `reminder_logs` (qui portent `recipientEmail`
 * et `recipientName`) et son journal d'audit (`actorEmail`, `ip`). **Des
 * données personnelles de membres survivant à une suppression que
 * l'administrateur croit complète** — et le docstring de la méthode l'affirmait
 * complète, en toutes lettres.
 *
 * ## Pourquoi une DÉCLARATION plutôt qu'une liste d'appels
 *
 * Une seconde liste écrite à la main divergerait du schéma au prochain modèle,
 * et le neuvième serait oublié exactement comme les cinq précédents. Ici la
 * suppression PARCOURT cette table, et `deprovision-complet.spec.ts` vérifie
 * qu'elle couvre tout modèle du schéma portant un `tenantId`. Un modèle neuf
 * n'est dans aucune des deux listes : le test échoue en disant quoi faire.
 */
export type SortDeLigne =
  /** Emportée par la déprovision. */
  | { sort: 'supprimee'; motif: string }
  /** Conservée volontairement — le motif dit pourquoi, et ce qu'il en coûte. */
  | { sort: 'conservee'; motif: string };

/**
 * Clé = nom du modèle Prisma tel qu'il s'écrit dans `schema.prisma`. La valeur
 * dit ce que la déprovision en fait. L'ORDRE compte : les lignes filles avant
 * leurs parentes (`access_rules` avant `collections`).
 */
export const LIGNES_PARTAGEES: Record<string, SortDeLigne> = {
  AccessRule: {
    sort: 'supprimee',
    motif:
      'elle décide d’un accès dont le sujet n’existe plus, et son tenant_id est ' +
      'NOT NULL vers une école absente — une ligne que rien ne peut plus lire ni réparer.',
  },
  Collection: {
    sort: 'supprimee',
    motif:
      'configuration de l’école. Son socle est recréé à chaque provisioning : ' +
      'sans ce nettoyage, chaque cycle en laisse un de plus, invisible de tous.',
  },
  ReminderLog: {
    sort: 'supprimee',
    motif:
      '⚠ porte `recipientEmail` et `recipientName` — des données personnelles de ' +
      'membres, qui survivaient à une suppression annoncée comme complète.',
  },
  AuditLog: {
    sort: 'supprimee',
    motif:
      '⚠ porte `actorEmail` et `ip`. Et `AuditService.list` étant borné au tenant, ' +
      'aucune route ne peut plus lire ce journal une fois l’école partie : le ' +
      'conserver retient des données personnelles que plus personne ne consultera.',
  },
  Subscription: {
    sort: 'supprimee',
    motif: 'abonnements de l’école ; clé étrangère RESTRICT, la déprovision échouerait sinon.',
  },
  Domain: {
    sort: 'supprimee',
    motif: 'routage de l’école ; clé étrangère RESTRICT.',
  },
  TenantSettings: {
    sort: 'supprimee',
    motif: 'réglages de l’école ; clé étrangère RESTRICT.',
  },
  Payment: {
    sort: 'conservee',
    motif:
      '⚠ PIÈCE COMPTABLE — elle ne se détruit pas par effet de bord d’une suppression ' +
      'd’école, et sa destruction est irréversible. Le module `payments` n’est pas ' +
      'construit (aucun écrivain, zéro ligne au 14 septembre 2026) : la question ne se ' +
      'pose donc pas encore. ⚠ Le jour où il servira, une école ayant payé ne pourra ' +
      'plus être déprovisionnée (clé étrangère paiement → abonnement) — ce refus sera ' +
      'JUSTE, et il faudra le dire à l’opérateur plutôt que de le contourner.',
  },
};

/** Les modèles que la déprovision doit vider, dans l’ordre de la déclaration. */
export const MODELES_A_SUPPRIMER = Object.entries(LIGNES_PARTAGEES)
  .filter(([, v]) => v.sort === 'supprimee')
  .map(([k]) => k);

/** `AccessRule` → `accessRule` : le nom de la propriété du client Prisma. */
export function proprietePrisma(modele: string): string {
  return modele.charAt(0).toLowerCase() + modele.slice(1);
}
