import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { HoldsService } from './holds.service';

const prismaStub = { tenantSettings: { findUnique: vi.fn().mockResolvedValue({ holdPickupDays: 7 }) } };

function makeService(mail: any = { sendHoldAvailable: vi.fn().mockResolvedValue({ sent: true }) }, circulation: any = {}) {
  return new HoldsService(prismaStub as any, mail as any, circulation as any, {} as any);
}

describe('HoldsService — cancelHold (anti-IDOR)', () => {
  it('réservation d’un AUTRE adhérent → 404, ne touche à rien', async () => {
    const circulation = { cancelHold: vi.fn() };
    const db = {
      patron: { findUnique: vi.fn().mockResolvedValue({ id: 'p-1', userId: 'user-1' }) },
      hold: { findUnique: vi.fn().mockResolvedValue({ id: 'h-1', patronId: 'AUTRE', status: 'PENDING' }) },
    } as any;
    await expect(
      makeService(undefined, circulation).cancelHold(db, 't1', 'user-1', 'h-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(circulation.cancelHold).not.toHaveBeenCalled();
  });

  it('sans carte → 404', async () => {
    const db = {
      patron: { findUnique: vi.fn().mockResolvedValue(null) },
      hold: { findUnique: vi.fn() },
    } as any;
    await expect(
      makeService().cancelHold(db, 't1', 'user-1', 'h-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('HoldsService — notifyAvailable (idempotence réserver-puis-envoyer)', () => {
  /** DB simulée : une réservation AVAILABLE avec état `notifiedAt` mutable. */
  function makeDb(notifiedAt: Date | null = null) {
    const row = {
      id: 'h-1',
      status: 'AVAILABLE',
      notifiedAt,
      expiryDate: new Date('2026-07-25T00:00:00Z'),
      record: { title: 'Titre' },
      patron: { user: { email: 'b@exemple.bf', firstName: 'B', lastName: 'X' } },
    };
    return {
      row,
      hold: {
        findMany: vi.fn(async () => (row.notifiedAt === null ? [row] : [])),
        updateMany: vi.fn(async ({ where, data }: any) => {
          // Réservation conditionnelle sur notifiedAt: null.
          if (where.notifiedAt === null && row.notifiedAt !== null) return { count: 0 };
          row.notifiedAt = data.notifiedAt;
          return { count: 1 };
        }),
      },
    } as any;
  }

  let mail: any;
  beforeEach(() => {
    mail = { sendHoldAvailable: vi.fn().mockResolvedValue({ sent: true }) };
  });

  it('envoie une fois et pose notifiedAt', async () => {
    const db = makeDb(null);
    const res = await makeService(mail).notifyAvailable(db, 't1', new Date('2026-07-18T00:00:00Z'));
    expect(res.sent).toBe(1);
    expect(mail.sendHoldAvailable).toHaveBeenCalledTimes(1);
    expect(db.row.notifiedAt).not.toBeNull();
  });

  it('deuxième passage : rien (déjà notifié)', async () => {
    const db = makeDb(new Date('2026-07-18T00:00:00Z'));
    const res = await makeService(mail).notifyAvailable(db, 't1', new Date('2026-07-19T00:00:00Z'));
    expect(res.sent).toBe(0);
    expect(mail.sendHoldAvailable).not.toHaveBeenCalled();
  });

  it('⚠ SANS SMTP : notifiedAt RELÂCHÉ et rien n’est compté', async () => {
    // LE défaut du 12 septembre 2026. `MailService` traitait « SMTP absent »
    // comme un succès : `sent += 1` comptait un courriel jamais parti, et
    // `notifiedAt` restait posé — donc le lecteur n'était JAMAIS prévenu que
    // son document l'attendait, et le guichet croyait l'avoir averti. La
    // réservation expirait sans que personne ne vienne la chercher.
    const muet = { sendHoldAvailable: vi.fn().mockResolvedValue({ sent: false, reason: 'smtp_absent' }) };
    const db = makeDb(null);

    const res = await makeService(muet).notifyAvailable(db, 't1', new Date('2026-07-18T00:00:00Z'));

    expect(res.sent).toBe(0);
    // Relâché : le prochain passage retentera, comme pour une panne SMTP.
    expect(db.row.notifiedAt).toBeNull();
  });

  it('échec SMTP : relâche notifiedAt pour retenter', async () => {
    const db = makeDb(null);
    mail.sendHoldAvailable.mockRejectedValueOnce(new Error('SMTP down'));
    const res = await makeService(mail).notifyAvailable(db, 't1', new Date('2026-07-18T00:00:00Z'));
    expect(res.sent).toBe(0);
    expect(db.row.notifiedAt).toBeNull(); // relâché → sera retenté
  });
});
