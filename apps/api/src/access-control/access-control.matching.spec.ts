import { describe, expect, it } from 'vitest';
import {
  explainAccessDenial,
  hasAccessViaRules,
  ruleMatchesStudent,
  StudentAccessContext,
} from './access-control.matching';

const ctx: StudentAccessContext = {
  tenantId: 'school-1',
  className: 'L1_DROIT',
  subscriptionTier: 'free',
};

function rule(partial: Partial<Parameters<typeof ruleMatchesStudent>[0]>) {
  return {
    tenantId: 'school-1',
    className: null,
    subscriptionTier: null,
    ...partial,
  };
}

describe('ruleMatchesStudent', () => {
  it('joker total (classe null + palier null) → accès', () => {
    expect(ruleMatchesStudent(rule({}), ctx)).toBe(true);
  });

  it('classe exacte + palier joker → accès', () => {
    expect(ruleMatchesStudent(rule({ className: 'L1_DROIT' }), ctx)).toBe(true);
  });

  it('classe joker + palier exact → accès', () => {
    expect(
      ruleMatchesStudent(rule({ subscriptionTier: 'free' }), ctx),
    ).toBe(true);
  });

  it('classe exacte + palier exact → accès', () => {
    expect(
      ruleMatchesStudent(
        rule({ className: 'L1_DROIT', subscriptionTier: 'free' }),
        ctx,
      ),
    ).toBe(true);
  });

  it('classe différente → refus', () => {
    expect(ruleMatchesStudent(rule({ className: 'M2_MEDECINE' }), ctx)).toBe(
      false,
    );
  });

  it('palier différent (règle premium, étudiant free) → refus', () => {
    expect(
      ruleMatchesStudent(rule({ subscriptionTier: 'premium' }), ctx),
    ).toBe(false);
  });

  it('bonne classe mais mauvais palier → refus', () => {
    expect(
      ruleMatchesStudent(
        rule({ className: 'L1_DROIT', subscriptionTier: 'premium' }),
        ctx,
      ),
    ).toBe(false);
  });

  it('autre école (tenant différent) → refus même si tout le reste correspond', () => {
    expect(
      ruleMatchesStudent(
        rule({ tenantId: 'school-2', className: 'L1_DROIT' }),
        ctx,
      ),
    ).toBe(false);
  });

  it('étudiant sans classe (null) : une règle ciblant une classe précise → refus', () => {
    const noClass: StudentAccessContext = { ...ctx, className: null };
    expect(ruleMatchesStudent(rule({ className: 'L1_DROIT' }), noClass)).toBe(
      false,
    );
    // mais un joker de classe reste accessible
    expect(ruleMatchesStudent(rule({}), noClass)).toBe(true);
  });
});

describe('hasAccessViaRules', () => {
  it('vrai dès qu’une règle correspond parmi plusieurs', () => {
    const rules = [
      rule({ className: 'M2_MEDECINE' }), // ne matche pas
      rule({ subscriptionTier: 'premium' }), // ne matche pas
      rule({ className: 'L1_DROIT' }), // matche
    ];
    expect(hasAccessViaRules(rules, ctx)).toBe(true);
  });

  it('faux si aucune règle ne correspond', () => {
    const rules = [
      rule({ className: 'M2_MEDECINE' }),
      rule({ tenantId: 'school-2' }),
    ];
    expect(hasAccessViaRules(rules, ctx)).toBe(false);
  });

  it('faux sur liste vide', () => {
    expect(hasAccessViaRules([], ctx)).toBe(false);
  });
});

describe('explainAccessDenial', () => {
  it('aucune règle pour l’école → NOT_CONFIGURED', () => {
    expect(explainAccessDenial([], ctx)).toEqual({ code: 'NOT_CONFIGURED' });
  });

  it('palier ok mais mauvaise classe → CLASS_MISMATCH avec la classe requise', () => {
    const rules = [rule({ className: 'M2_MEDECINE' })];
    expect(explainAccessDenial(rules, ctx)).toEqual({
      code: 'CLASS_MISMATCH',
      requiredClassName: 'M2_MEDECINE',
    });
  });

  it('classe ok (ou jokée) mais mauvais palier → SUBSCRIPTION_REQUIRED', () => {
    const rules = [rule({ className: 'L1_DROIT', subscriptionTier: 'premium' })];
    expect(explainAccessDenial(rules, ctx)).toEqual({
      code: 'SUBSCRIPTION_REQUIRED',
      requiredSubscriptionTier: 'premium',
    });
  });

  it('classe jokée mais mauvais palier → SUBSCRIPTION_REQUIRED', () => {
    const rules = [rule({ subscriptionTier: 'premium' })];
    expect(explainAccessDenial(rules, ctx)).toEqual({
      code: 'SUBSCRIPTION_REQUIRED',
      requiredSubscriptionTier: 'premium',
    });
  });
});
