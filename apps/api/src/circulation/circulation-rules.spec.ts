import { describe, expect, it } from 'vitest';
import {
  canRenew,
  computeDueDate,
  computeFine,
  DEFAULT_RULE,
  resolveRule,
} from './circulation-rules';

const DAY = 24 * 3600 * 1000;

const rules = [
  { patronCategory: 'etudiant', itemType: 'livre', loanPeriodDays: 7, maxRenewals: 1, maxCheckouts: 3, finePerDay: 50 },
  { patronCategory: 'etudiant', itemType: '*', loanPeriodDays: 14, maxRenewals: 2, maxCheckouts: 5, finePerDay: 25 },
  { patronCategory: 'enseignant', itemType: '*', loanPeriodDays: 30, maxRenewals: 3, maxCheckouts: 10, finePerDay: 0 },
];

describe('resolveRule', () => {
  it('correspondance exacte catégorie + type', () => {
    expect(resolveRule(rules, 'etudiant', 'livre').loanPeriodDays).toBe(7);
  });

  it("joker '*' de la catégorie si pas de règle exacte", () => {
    expect(resolveRule(rules, 'etudiant', 'dvd').loanPeriodDays).toBe(14);
    expect(resolveRule(rules, 'etudiant', null).loanPeriodDays).toBe(14);
  });

  it('règle par défaut si catégorie inconnue', () => {
    expect(resolveRule(rules, 'visiteur', 'livre')).toBe(DEFAULT_RULE);
    expect(resolveRule([], 'etudiant', 'livre')).toBe(DEFAULT_RULE);
  });
});

describe('computeDueDate', () => {
  it('échéance = début + durée du prêt', () => {
    const now = new Date('2026-07-01T10:00:00Z');
    expect(computeDueDate(now, rules[0]).toISOString()).toBe(
      '2026-07-08T10:00:00.000Z',
    );
  });
});

describe('computeFine — amendes en FCFA', () => {
  const due = new Date('2026-07-10T12:00:00Z');

  it('rendu à temps → 0 FCFA', () => {
    expect(computeFine(due, new Date('2026-07-10T12:00:00Z'), 50)).toEqual({
      overdueDays: 0,
      amountXof: 0,
    });
    expect(computeFine(due, new Date('2026-07-01T00:00:00Z'), 50).amountXof).toBe(0);
  });

  it('3 jours de retard × 50 FCFA = 150 FCFA', () => {
    expect(computeFine(due, new Date(due.getTime() + 3 * DAY), 50)).toEqual({
      overdueDays: 3,
      amountXof: 150,
    });
  });

  it('jour entamé compté entier (1 h de retard = 1 jour)', () => {
    expect(computeFine(due, new Date(due.getTime() + 3600 * 1000), 50)).toEqual({
      overdueDays: 1,
      amountXof: 50,
    });
  });

  it('tarif 0 FCFA/jour → jamais d’amende, jours quand même comptés', () => {
    const fine = computeFine(due, new Date(due.getTime() + 5 * DAY), 0);
    expect(fine).toEqual({ overdueDays: 5, amountXof: 0 });
  });
});

describe('canRenew', () => {
  const rule = rules[0]; // maxRenewals: 1
  const now = new Date('2026-07-05T00:00:00Z');
  const future = new Date('2026-07-09T00:00:00Z');

  it('accepté sous le plafond, sans retard ni réservation', () => {
    expect(canRenew({ renewals: 0, dueDate: future }, rule, now, 0)).toEqual({
      ok: true,
    });
  });

  it('refusé : plafond de renouvellements atteint', () => {
    expect(canRenew({ renewals: 1, dueDate: future }, rule, now, 0).reason).toBe(
      'max_renewals',
    );
  });

  it('refusé : prêt en retard', () => {
    const past = new Date('2026-07-01T00:00:00Z');
    expect(canRenew({ renewals: 0, dueDate: past }, rule, now, 0).reason).toBe(
      'overdue',
    );
  });

  it('refusé : réservations actives sur la notice', () => {
    expect(canRenew({ renewals: 0, dueDate: future }, rule, now, 2).reason).toBe(
      'holds_pending',
    );
  });
});

describe('resolveRule — joker global', () => {
  const R = (patronCategory: string, itemType: string, loanPeriodDays: number) => ({
    patronCategory, itemType, loanPeriodDays, maxRenewals: 1, maxCheckouts: 5, finePerDay: 0,
  });

  it('RÉGRESSION : une règle */* s’applique à une catégorie inconnue', () => {
    // Elle était INERTE : le joker ne portait que sur itemType, donc une règle
    // */* n'était jamais trouvée et le code retombait sur DEFAULT_RULE. Le
    // provisioning en pose une — sans ce repli, il aurait posé une ligne
    // décorative que personne n'aurait vue s'appliquer.
    const regles = [R('*', '*', 21)];
    expect(resolveRule(regles, 'etudiant', 'livre').loanPeriodDays).toBe(21);
    expect(resolveRule(regles, 'enseignant', null).loanPeriodDays).toBe(21);
  });

  it('la règle la plus SPÉCIFIQUE l’emporte sur le joker global', () => {
    const regles = [R('*', '*', 21), R('etudiant', '*', 7), R('etudiant', 'dvd', 3)];
    expect(resolveRule(regles, 'etudiant', 'dvd').loanPeriodDays).toBe(3);
    expect(resolveRule(regles, 'etudiant', 'livre').loanPeriodDays).toBe(7);
    expect(resolveRule(regles, 'enseignant', 'livre').loanPeriodDays).toBe(21);
  });

  it('sans aucune règle, le défaut du code s’applique toujours', () => {
    expect(resolveRule([], 'etudiant', 'livre')).toEqual(DEFAULT_RULE);
  });
});
