import { describe, expect, it, vi } from 'vitest';
import { CirculationService } from './circulation.service';

/**
 * LE LIEN VERS LA NOTICE. Les écrans du personnel affichaient un titre sur
 * lequel on ne pouvait pas cliquer : `record: { select: { title: true } }` ne
 * ramenait pas l'identifiant, donc aucun lien n'était constructible.
 *
 * Le défaut était aux DEUX endroits — la situation d'un adhérent ET la liste
 * des retards. Un seul corrigé, il revenait par l'autre.
 */
const service = new CirculationService();
const NOW = new Date('2026-09-10T12:00:00Z');
const REGLE = { patronCategory: 'etudiant', itemType: 'livre', loanPeriodDays: 14, maxRenewals: 1, maxCheckouts: 5, finePerDay: 100 };

const PRET = {
  id: 'co-1',
  dueDate: new Date('2026-09-01T00:00:00Z'),
  renewals: 0,
  item: { barcode: 'EX-1', itemType: 'livre', record: { id: 'rec-1', title: 'Titre' } },
  patron: { id: 'p-1', barcode: 'AD-1', category: 'etudiant' },
};

function fauxDb(surcharge: Record<string, unknown> = {}) {
  return {
    patron: { findUnique: vi.fn().mockResolvedValue({ id: 'p-1', category: 'etudiant', user: { firstName: 'A', lastName: 'B' } }) },
    checkout: {
      findMany: vi.fn().mockResolvedValue([PRET]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { fineAmount: 0 } }),
    },
    hold: { findMany: vi.fn().mockResolvedValue([]) },
    circulationRule: { findMany: vi.fn().mockResolvedValue([REGLE]) },
    ...surcharge,
  } as never;
}

describe('situation d’un adhérent — le titre est cliquable', () => {
  it('⚠ demande l’identifiant de la notice, pas seulement son titre', async () => {
    const db = fauxDb();
    await service.patronSituation(db, 'p-1', NOW);
    const inclus = (db as never as { checkout: { findMany: { mock: { calls: never[][] } } } }).checkout
      .findMany.mock.calls[0][0] as { include: unknown };
    expect(JSON.stringify(inclus.include)).toContain('"id":true');
  });

  it('expose recordId sur chaque prêt rendu', async () => {
    const r = await service.patronSituation(fauxDb(), 'p-1', NOW);
    expect(r.checkouts[0].recordId).toBe('rec-1');
    expect(r.checkouts[0].title).toBe('Titre');
  });

  it('les RÉSERVATIONS aussi demandent l’identifiant', async () => {
    const db = fauxDb();
    await service.patronSituation(db, 'p-1', NOW);
    const inclus = (db as never as { hold: { findMany: { mock: { calls: never[][] } } } }).hold
      .findMany.mock.calls[0][0] as { include: unknown };
    expect(JSON.stringify(inclus.include)).toContain('"id":true');
  });
});

describe('liste des retards — le même défaut, corrigé au même moment', () => {
  it('⚠ expose recordId : un tiers de correctif laisse revenir le défaut', async () => {
    const r = await service.listOverdues(fauxDb(), NOW);
    expect(r[0].recordId).toBe('rec-1');
  });
});
