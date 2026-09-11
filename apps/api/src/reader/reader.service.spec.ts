import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReaderService } from './reader.service';
import { PatronsService } from '../patrons/patrons.service';

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** ReaderService avec un PrismaService simulé (tenant_settings). */
function svc(settings: Record<string, unknown> | null = null) {
  const prisma = { tenantSettings: { findUnique: vi.fn().mockResolvedValue(settings) } };
  return new ReaderService(prisma as any, new PatronsService());
}

function loan(over: Partial<any> = {}) {
  return {
    id: 'co-1',
    itemId: 'it-1',
    checkoutDate: day('2026-07-01'),
    dueDate: day('2026-07-20'),
    returnDate: null,
    renewals: 0,
    item: { barcode: 'BC-1', record: { id: 'rec-1', title: 'Titre' } },
    ...over,
  };
}

describe('ReaderService — myLoans (self-scopé)', () => {
  it('sans carte (patron introuvable) → hasCard=false, listes vides', async () => {
    const db = { patron: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    const res = await svc().myLoans(db, 'user-x');
    expect(res.hasCard).toBe(false);
    expect(res.current).toEqual([]);
    expect(res.counters).toEqual({ current: 0, overdue: 0 });
    // La résolution se fait bien par userId (jamais par un param d'identité).
    expect(db.patron.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-x' } });
  });

  it('prêts en cours : retard calculé, compteurs justes', async () => {
    const db = {
      patron: { findUnique: vi.fn().mockResolvedValue({ id: 'p-1', userId: 'user-1' }) },
      checkout: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([loan({ dueDate: day('2026-07-10') }), loan({ id: 'co-2', dueDate: day('2026-07-30') })])
          .mockResolvedValueOnce([]),
        count: vi.fn().mockResolvedValue(0),
      },
    } as any;
    const res = await svc().myLoans(db, 'user-1', {}, day('2026-07-18'));
    expect(res.hasCard).toBe(true);
    expect(res.current).toHaveLength(2);
    expect(res.counters).toEqual({ current: 2, overdue: 1 });
    const late = res.current.find((c) => c.checkoutId === 'co-1');
    expect(late?.overdue).toBe(true);
    expect(late?.overdueDays).toBe(8); // 10→18 juillet
    // Toutes les requêtes de prêts sont bornées au patron résolu.
    expect(db.checkout.findMany.mock.calls[0][0].where).toMatchObject({
      patronId: 'p-1',
      returnDate: null,
    });
  });
});

describe('ReaderService — renewLoan (self-scopé + politique)', () => {
  const myPatron = { id: 'p-1', userId: 'user-1' };
  function dbWith(checkout: any, holdCount = 0) {
    return {
      patron: { findUnique: vi.fn().mockResolvedValue(myPatron) },
      checkout: {
        findUnique: vi.fn().mockResolvedValue(checkout),
        update: vi.fn(async ({ data }: any) => ({ renewals: data.renewals })),
      },
      hold: { count: vi.fn().mockResolvedValue(holdCount) },
    } as any;
  }
  const mine = (over: Partial<any> = {}) => ({
    id: 'co-1',
    patronId: 'p-1',
    returnDate: null,
    renewals: 0,
    dueDate: day('2026-07-30'),
    item: { record: { id: 'rec-1', title: 'Titre' } },
    ...over,
  });

  it('ANTI-IDOR : prêt d’un autre adhérent → 404 (n’envoie rien)', async () => {
    const db = dbWith(mine({ patronId: 'AUTRE' }));
    await expect(
      svc().renewLoan(db, 't1', 'user-1', 'co-1', day('2026-07-18')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.checkout.update).not.toHaveBeenCalled();
  });

  it('prêt déjà rendu → 404', async () => {
    const db = dbWith(mine({ returnDate: day('2026-07-15') }));
    await expect(
      svc().renewLoan(db, 't1', 'user-1', 'co-1', day('2026-07-18')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renouvellement en ligne désactivé → 409', async () => {
    const db = dbWith(mine());
    await expect(
      svc({ onlineRenewalEnabled: false }).renewLoan(db, 't1', 'user-1', 'co-1', day('2026-07-18')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('plafond atteint → 409', async () => {
    const db = dbWith(mine({ renewals: 2 }));
    await expect(
      svc({ onlineRenewalMax: 2, onlineRenewalEnabled: true }).renewLoan(db, 't1', 'user-1', 'co-1', day('2026-07-18')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prêt en retard + refuseOverdue → 409', async () => {
    const db = dbWith(mine({ dueDate: day('2026-07-10') }));
    await expect(
      svc({ onlineRenewalEnabled: true, onlineRenewalRefuseOverdue: true }).renewLoan(
        db, 't1', 'user-1', 'co-1', day('2026-07-18'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('réservé par un AUTRE lecteur → 409 (exclut les réservations du lecteur lui-même)', async () => {
    const db = dbWith(mine(), 1);
    await expect(
      svc({ onlineRenewalEnabled: true }).renewLoan(db, 't1', 'user-1', 'co-1', day('2026-07-18')),
    ).rejects.toBeInstanceOf(ConflictException);
    // Le comptage exclut bien l'adhérent courant.
    expect(db.hold.count.mock.calls[0][0].where.patronId).toEqual({ not: 'p-1' });
  });

  it('cas nominal → prolonge, incrémente renewals, calcule le reste', async () => {
    const db = dbWith(mine({ renewals: 0 }));
    const res = await svc({ onlineRenewalEnabled: true, onlineRenewalMax: 2, onlineRenewalDays: 14 }).renewLoan(
      db, 't1', 'user-1', 'co-1', day('2026-07-18'),
    );
    expect(res.renewals).toBe(1);
    expect(res.remaining).toBe(1);
    expect(res.dueDate).toEqual(day('2026-08-01')); // +14 j
  });
});
