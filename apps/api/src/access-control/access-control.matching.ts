import { AccessRule } from '@prisma/client';

/** Contexte d'un étudiant pour l'évaluation des droits d'accès. */
export interface StudentAccessContext {
  tenantId: string;
  className: string | null;
  subscriptionTier: string;
}

/** Sous-ensemble d'une règle nécessaire à l'évaluation. */
export type AccessRuleCriteria = Pick<
  AccessRule,
  'tenantId' | 'className' | 'subscriptionTier'
>;

/**
 * Une règle d'accès correspond à un étudiant quand :
 *  - elle vise la même école (tenantId) ;
 *  - sa classe est un joker (null) OU égale à celle de l'étudiant ;
 *  - son palier d'abonnement est un joker (null) OU égal à celui de l'étudiant.
 *
 * C'est la source de vérité du contrôle d'accès (testée unitairement).
 */
export function ruleMatchesStudent(
  rule: AccessRuleCriteria,
  ctx: StudentAccessContext,
): boolean {
  if (rule.tenantId !== ctx.tenantId) return false;
  if (rule.className !== null && rule.className !== ctx.className) return false;
  if (
    rule.subscriptionTier !== null &&
    rule.subscriptionTier !== ctx.subscriptionTier
  ) {
    return false;
  }
  return true;
}

/** Vrai si au moins une règle de la liste donne accès à l'étudiant. */
export function hasAccessViaRules(
  rules: AccessRuleCriteria[],
  ctx: StudentAccessContext,
): boolean {
  return rules.some((rule) => ruleMatchesStudent(rule, ctx));
}

/** Raison d'un refus d'accès, utilisée pour construire un message clair côté API/UI. */
export type AccessDenialReason =
  | { code: 'NOT_CONFIGURED' }
  | { code: 'CLASS_MISMATCH'; requiredClassName: string }
  | { code: 'SUBSCRIPTION_REQUIRED'; requiredSubscriptionTier: string };

/**
 * Explique pourquoi aucune règle ne donne accès (à appeler seulement quand
 * `hasAccessViaRules` est faux). Heuristique : on cherche d'abord une règle
 * bloquée uniquement par la classe (le palier de l'étudiant lui convient déjà)
 * — sinon une règle bloquée par le palier. Sans aucune règle pour l'école,
 * l'accès n'est simplement pas configuré.
 */
export function explainAccessDenial(
  rules: AccessRuleCriteria[],
  ctx: StudentAccessContext,
): AccessDenialReason {
  if (rules.length === 0) return { code: 'NOT_CONFIGURED' };

  const subscriptionOk = (rule: AccessRuleCriteria) =>
    rule.subscriptionTier === null || rule.subscriptionTier === ctx.subscriptionTier;

  const classIssue = rules.find(
    (rule) => subscriptionOk(rule) && rule.className !== null && rule.className !== ctx.className,
  );
  if (classIssue) {
    return { code: 'CLASS_MISMATCH', requiredClassName: classIssue.className as string };
  }

  const subscriptionIssue = rules.find(
    (rule) => rule.subscriptionTier !== null && rule.subscriptionTier !== ctx.subscriptionTier,
  );
  if (subscriptionIssue) {
    return {
      code: 'SUBSCRIPTION_REQUIRED',
      requiredSubscriptionTier: subscriptionIssue.subscriptionTier as string,
    };
  }

  return { code: 'NOT_CONFIGURED' };
}
