import { AccessRule } from '@prisma/client';

/**
 * LE DOCUMENT EST-IL SOUS EMBARGO À CET INSTANT ? — P6-4.
 *
 * ⚠ UNE COMPARAISON, PAS UN ÉTAT. La levée est « automatique à la date » parce
 * qu'il n'y a rien à lever : aucune tâche planifiée, aucun drapeau à baisser,
 * donc rien qui puisse ne pas tourner. « Un embargo qu'il faut penser à lever ne
 * se lève jamais. »
 *
 * ⚠ `maintenant` est un PARAMÈTRE et non `new Date()` : un embargo se teste aux
 * bornes — la veille, la seconde d'après — et une fonction qui lit l'horloge
 * elle-même ne se teste qu'en attendant.
 */
export function sousEmbargo(
  embargoUntil: Date | null | undefined,
  maintenant: Date,
): boolean {
  if (!embargoUntil) return false;
  // Strictement supérieur : à la seconde exacte de la levée, le document est
  // libre. Une borne inclusive ferait durer l'embargo un instant de trop, et
  // « jusqu'au 1er janvier » se comprend comme « libre le 1er janvier ».
  return embargoUntil.getTime() > maintenant.getTime();
}

/**
 * ⚠ LES RÈGLES D'ACCÈS NE S'HÉRITENT PAS DANS LA HIÉRARCHIE. Décision du
 * 12 septembre 2026 (P6-1), écrite ici parce que c'est LE point de décision.
 *
 * Une collection peut avoir une parente depuis P6-1 (Faculté → Département →
 * Type). La question était : une règle posée sur la faculté vaut-elle pour ses
 * départements ? **Non.** Chaque collection porte ses propres règles, et une
 * sous-collection neuve n'autorise PERSONNE — fail-closed.
 *
 * ## Le fait qui commande
 *
 * `hasAccessViaRules` ci-dessous rend vrai si AU MOINS UNE règle autorise. Les
 * règles sont un OU de permissions. Hériter, c'est donc ajouter des règles :
 * ça ne peut qu'ÉLARGIR l'accès, jamais le restreindre.
 *
 * ## Les deux raisons du refus
 *
 * 1. ⚠ **LE DANGER EST DIFFÉRÉ.** Le geste dangereux n'est pas de poser la
 *    règle sur la faculté — celui-là est examiné. C'est de créer une
 *    sous-collection SIX MOIS PLUS TARD, qui héritera d'une règle que personne
 *    ne réexaminera. Un faux silencieux de droits, qui se manifeste sur un
 *    objet que personne ne regarde, et dans la catégorie où une erreur ne casse
 *    rien : elle EXPOSE. Une collection « Thèses sous embargo » créée sous une
 *    faculté ouverte serait ouverte à sa naissance.
 * 2. ⚠ **UNE TRACE QUI VIT AILLEURS QUE L'OBJET TRACÉ N'EST PAS UNE TRACE.**
 *    Sous héritage, répondre à « qui voit cette collection ? » demande de
 *    remonter l'arbre, et le journal d'audit de l'élargissement est sur
 *    l'ANCÊTRE. On ne peut pas auditer un accès en regardant l'objet accédé.
 *
 * ## L'inconvénient, assumé — et c'est LUI le critère
 *
 * Sans héritage, une règle doit être posée sur chaque collection, et une
 * modification de la faculté ne descend pas : il faut repropager. C'est réel.
 *
 * Mais **cet inconvénient SE VOIT** — l'administrateur constate que la règle
 * n'a pas bougé, ou qu'une collection n'est visible de personne. L'inconvénient
 * de l'héritage ne se voit pas : un étudiant accède à une thèse qu'il ne
 * devrait pas, et rien ne le signale. Entre deux défauts, on choisit celui qui
 * se manifeste.
 *
 * ## Ce qui remplace le confort de l'héritage
 *
 * Une action de PROPAGATION explicite : « appliquer ces règles aux
 * sous-collections » ÉCRIT les règles vers le bas, en listant ce qu'elle
 * touche, et passe au journal d'audit. L'élargissement devient un ÉVÉNEMENT
 * daté et attribué, au lieu d'un état implicite.
 *
 * `non-heritage.spec.ts` porte cette propriété en test : il échoue si une
 * règle d'ancêtre se met à accorder l'accès.
 */

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
  /**
   * ⚠ EMBARGO (P6-4) — le seul refus qui ne dépend PAS de qui demande.
   *
   * Les trois autres motifs disent « vous n'avez pas le droit » ; celui-ci dit
   * « personne ne l'a encore ». Il se place donc AVANT l'évaluation des règles :
   * chercher une classe ou un palier quand le document lui-même est fermé
   * produirait un message faux (« réservé aux M2 ») pour une thèse que même un
   * M2 ne peut pas lire.
   */
  | { code: 'EMBARGO'; embargoUntil: Date }
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
