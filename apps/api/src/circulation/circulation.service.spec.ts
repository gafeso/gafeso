import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CirculationService } from './circulation.service';

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-07-05T12:00:00Z');

function makeDb() {
  const db: any = {
    item: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    patron: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    checkout: {
      create: vi.fn(async ({ data }: any) => ({ id: 'co-1', renewals: 0, ...data })),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { fineAmount: 0 } }),
    },
    hold: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }: any) => ({ id: 'hold-1', ...data })),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    biblioRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    circulationRule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ id: 'rule-1', ...data })),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  db.$transaction = vi.fn(async (cb: any) => cb(db));
  return db;
}

const ITEM = {
  id: 'item-1',
  barcode: 'ZK-1',
  recordId: 'rec-1',
  itemType: 'livre',
  status: 'AVAILABLE',
  record: { id: 'rec-1', title: 'Droit foncier' },
};

const PATRON = {
  id: 'pat-1',
  barcode: 'P-1',
  category: 'etudiant',
  expiryDate: null,
};

const RULE = {
  patronCategory: 'etudiant',
  itemType: 'livre',
  loanPeriodDays: 7,
  maxRenewals: 1,
  maxCheckouts: 3,
  finePerDay: 50,
};

describe('CirculationService — prêt', () => {
  let service: CirculationService;
  let db: any;

  beforeEach(() => {
    service = new CirculationService();
    db = makeDb();
    db.item.findUnique.mockResolvedValue({ ...ITEM });
    db.patron.findUnique.mockResolvedValue({ ...PATRON });
    db.circulationRule.findMany.mockResolvedValue([RULE]);
  });

  it('prêt nominal : échéance selon la règle, exemplaire CHECKED_OUT', async () => {
    const result = await service.checkout(
      db,
      { itemBarcode: 'ZK-1', patronBarcode: 'P-1' },
      NOW,
    );

    // L'échéance n'est plus « + 7 × 24 h » mais le 7e jour CALENDAIRE à
    // l'heure d'échéance de l'établissement (16 h par défaut). Deux emprunts
    // du même jour ont donc la même échéance, quelle que soit l'heure.
    expect(result.dueDate.toISOString()).toBe('2026-07-12T16:00:00.000Z');
    expect(db.checkout.create.mock.calls[0][0].data).toMatchObject({
      itemId: 'item-1',
      patronId: 'pat-1',
    });
    // Passage CHECKED_OUT conditionnel (l'état vérifié doit être inchangé)
    expect(db.item.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', status: 'AVAILABLE' },
      data: { status: 'CHECKED_OUT' },
    });
  });

  it('emprunt APRÈS l’heure d’échéance : même jour calendaire, pas le lendemain', async () => {
    // Règle produit : « rendu le 12 », quelle que soit l'heure d'emprunt.
    // Avec l'ancien calcul en multiples de 24 h, un emprunt à 17 h était dû le
    // 12 à 17 h — et rendu le 12 à 17 h 30, il coûtait un jour d'amende.
    const tard = new Date('2026-07-05T17:00:00Z');
    const result = await service.checkout(
      db,
      { itemBarcode: 'ZK-1', patronBarcode: 'P-1' },
      tard,
    );
    expect(result.dueDate.toISOString()).toBe('2026-07-12T16:00:00.000Z');
  });

  it('respecte l’heure et le fuseau réglés par l’établissement', async () => {
    const result = await service.checkout(
      db,
      { itemBarcode: 'ZK-1', patronBarcode: 'P-1' },
      NOW,
      { loanDueTime: '09:30', timezone: 'Africa/Nairobi' },
    );
    // 09:30 à Nairobi (UTC+3) = 06:30 UTC.
    expect(result.dueDate.toISOString()).toBe('2026-07-12T06:30:00.000Z');
  });

  it('course : exemplaire pris entre la vérification et la transaction → 409, aucun prêt créé', async () => {
    db.item.updateMany.mockResolvedValue({ count: 0 }); // quelqu'un est passé avant
    await expect(
      service.checkout(db, { itemBarcode: 'ZK-1', patronBarcode: 'P-1' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.checkout.create).not.toHaveBeenCalled();
  });

  it('refuse un exemplaire non disponible (CHECKED_OUT)', async () => {
    db.item.findUnique.mockResolvedValue({ ...ITEM, status: 'CHECKED_OUT' });
    await expect(
      service.checkout(db, { itemBarcode: 'ZK-1', patronBarcode: 'P-1' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse une carte expirée (403)', async () => {
    db.patron.findUnique.mockResolvedValue({
      ...PATRON,
      expiryDate: new Date(NOW.getTime() - DAY),
    });
    await expect(
      service.checkout(db, { itemBarcode: 'ZK-1', patronBarcode: 'P-1' }, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse au plafond de prêts de la catégorie', async () => {
    db.checkout.count.mockResolvedValue(3); // maxCheckouts = 3
    await expect(
      service.checkout(db, { itemBarcode: 'ZK-1', patronBarcode: 'P-1' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.checkout.create).not.toHaveBeenCalled();
  });

  it('exemplaire mis de côté : part avec son réservataire (hold FULFILLED)', async () => {
    db.item.findUnique.mockResolvedValue({ ...ITEM, status: 'ON_HOLD' });
    db.hold.findFirst.mockResolvedValue({
      id: 'hold-9',
      patronId: 'pat-1',
      status: 'AVAILABLE',
    });

    await service.checkout(db, { itemBarcode: 'ZK-1', patronBarcode: 'P-1' }, NOW);

    expect(db.hold.update).toHaveBeenCalledWith({
      where: { id: 'hold-9' },
      data: { status: 'FULFILLED' },
    });
  });

  it('exemplaire mis de côté pour un AUTRE adhérent → refus', async () => {
    db.item.findUnique.mockResolvedValue({ ...ITEM, status: 'ON_HOLD' });
    db.hold.findFirst.mockResolvedValue({
      id: 'hold-9',
      patronId: 'quelqu-un-d-autre',
      status: 'AVAILABLE',
    });
    await expect(
      service.checkout(db, { itemBarcode: 'ZK-1', patronBarcode: 'P-1' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CirculationService — retour', () => {
  let service: CirculationService;
  let db: any;

  const OPEN_CHECKOUT = {
    id: 'co-1',
    itemId: 'item-1',
    patronId: 'pat-1',
    dueDate: new Date(NOW.getTime() - 3 * DAY), // 3 jours de retard
    returnDate: null,
    item: { ...ITEM, status: 'CHECKED_OUT' },
    patron: { ...PATRON },
  };

  beforeEach(() => {
    service = new CirculationService();
    db = makeDb();
    db.circulationRule.findMany.mockResolvedValue([RULE]);
  });

  it('retour en retard : amende 3 j × 50 = 150 FCFA enregistrée, exemplaire libéré', async () => {
    db.checkout.findFirst.mockResolvedValue({ ...OPEN_CHECKOUT });

    const result = await service.returnItem(db, 'ZK-1', NOW);

    expect(result.fine).toEqual({ overdueDays: 3, amountXof: 150 });
    // Clôture conditionnelle (returnDate encore null) avec l'amende
    const closeArg = db.checkout.updateMany.mock.calls[0][0];
    expect(closeArg.where).toEqual({ id: 'co-1', returnDate: null });
    expect(closeArg.data.fineAmount).toBe(150);
    expect(db.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { status: 'AVAILABLE' },
    });
    expect(result.holdReady).toBeNull();
  });

  it('course : prêt déjà clôturé entre-temps (double scan) → 409', async () => {
    db.checkout.findFirst.mockResolvedValue({ ...OPEN_CHECKOUT });
    db.checkout.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.returnItem(db, 'ZK-1', NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('retour à temps : amende 0', async () => {
    db.checkout.findFirst.mockResolvedValue({
      ...OPEN_CHECKOUT,
      dueDate: new Date(NOW.getTime() + DAY),
    });
    const result = await service.returnItem(db, 'ZK-1', NOW);
    expect(result.fine.amountXof).toBe(0);
  });

  it('réservation en attente : exemplaire mis de côté, hold → AVAILABLE + 7 j', async () => {
    db.checkout.findFirst.mockResolvedValue({ ...OPEN_CHECKOUT });
    db.hold.findFirst.mockResolvedValue({
      id: 'hold-2',
      patronId: 'pat-2',
      status: 'PENDING',
    });

    const result = await service.returnItem(db, 'ZK-1', NOW);

    expect(result.holdReady).toEqual({
      holdId: 'hold-2',
      patronId: 'pat-2',
      pickupDays: 7,
    });
    const holdUpdate = db.hold.update.mock.calls[0][0];
    expect(holdUpdate.data.status).toBe('AVAILABLE');
    expect(holdUpdate.data.expiryDate.getTime()).toBe(NOW.getTime() + 7 * DAY);
    expect(db.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { status: 'ON_HOLD' },
    });
  });

  it('aucun prêt en cours pour ce code-barres → 404', async () => {
    await expect(service.returnItem(db, 'ZK-inconnu', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CirculationService — renouvellement', () => {
  let service: CirculationService;
  let db: any;

  beforeEach(() => {
    service = new CirculationService();
    db = makeDb();
    db.circulationRule.findMany.mockResolvedValue([RULE]);
    db.checkout.findUnique.mockResolvedValue({
      id: 'co-1',
      renewals: 0,
      returnDate: null,
      dueDate: new Date(NOW.getTime() + 2 * DAY),
      item: { ...ITEM },
      patron: { ...PATRON },
    });
  });

  it('renouvelle : nouvelle échéance depuis maintenant, compteur +1', async () => {
    const result = await service.renew(db, 'co-1', NOW);
    // L'échéance n'est plus « + 7 × 24 h » mais le 7e jour CALENDAIRE à
    // l'heure d'échéance de l'établissement (16 h par défaut). Deux emprunts
    // du même jour ont donc la même échéance, quelle que soit l'heure.
    expect(result.dueDate.toISOString()).toBe('2026-07-12T16:00:00.000Z');
    expect(db.checkout.update.mock.calls[0][0].data.renewals).toBe(1);
  });

  it('refuse si réservation active sur la notice', async () => {
    db.hold.count.mockResolvedValue(1);
    await expect(service.renew(db, 'co-1', NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuse un prêt déjà rendu', async () => {
    db.checkout.findUnique.mockResolvedValue({
      id: 'co-1',
      returnDate: new Date(),
    });
    await expect(service.renew(db, 'co-1', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CirculationService — réservations', () => {
  let service: CirculationService;
  let db: any;

  beforeEach(() => {
    service = new CirculationService();
    db = makeDb();
    db.patron.findUnique.mockResolvedValue({ ...PATRON });
  });

  it('exemplaire libre → mis de côté immédiatement (AVAILABLE + retrait 7 j)', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      items: [{ id: 'item-1', status: 'AVAILABLE' }],
    });

    const result = await service.placeHold(
      db,
      { recordId: 'rec-1', patronBarcode: 'P-1' },
      NOW,
    );

    expect(result.readyForPickup).toBe(true);
    expect(db.hold.create.mock.calls[0][0].data.status).toBe('AVAILABLE');
    expect(db.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { status: 'ON_HOLD' },
    });
  });

  it('aucun exemplaire libre → file d’attente avec position', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      items: [{ id: 'item-1', status: 'CHECKED_OUT' }],
    });
    db.hold.count.mockResolvedValue(2); // deux réservations déjà actives

    const result = await service.placeHold(
      db,
      { recordId: 'rec-1', patronBarcode: 'P-1' },
      NOW,
    );

    expect(result.readyForPickup).toBe(false);
    expect(result.queuePosition).toBe(3);
    expect(db.hold.create.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING',
      priority: 3,
    });
  });

  it('réservation en double refusée', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({ id: 'rec-1', items: [] });
    db.hold.findFirst.mockResolvedValue({ id: 'hold-actif' });
    await expect(
      service.placeHold(db, { recordId: 'rec-1', patronBarcode: 'P-1' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('annulation d’une réservation servie : l’exemplaire passe au suivant', async () => {
    db.hold.findUnique.mockResolvedValue({
      id: 'hold-1',
      recordId: 'rec-1',
      status: 'AVAILABLE',
    });
    db.item.findFirst.mockResolvedValue({ id: 'item-1', status: 'ON_HOLD' });
    db.hold.findFirst.mockResolvedValue({ id: 'hold-suivant', status: 'PENDING' });

    await service.cancelHold(db, 'hold-1', NOW);

    // le suivant est servi, l'exemplaire reste ON_HOLD
    expect(
      db.hold.update.mock.calls.some(
        (c: any) => c[0].where.id === 'hold-suivant' && c[0].data.status === 'AVAILABLE',
      ),
    ).toBe(true);
    expect(db.item.update).not.toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { status: 'AVAILABLE' },
    });
  });

  it('annulation sans file d’attente : l’exemplaire redevient AVAILABLE', async () => {
    db.hold.findUnique.mockResolvedValue({
      id: 'hold-1',
      recordId: 'rec-1',
      status: 'AVAILABLE',
    });
    db.item.findFirst.mockResolvedValue({ id: 'item-1', status: 'ON_HOLD' });
    db.hold.findFirst.mockResolvedValue(null);

    await service.cancelHold(db, 'hold-1', NOW);

    expect(db.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { status: 'AVAILABLE' },
    });
  });
});

describe('CirculationService — registres et amendes', () => {
  it('listOverdues calcule l’amende courue par prêt (FCFA)', async () => {
    const service = new CirculationService();
    const db = makeDb();
    db.circulationRule.findMany.mockResolvedValue([RULE]);
    db.checkout.findMany.mockResolvedValue([
      {
        id: 'co-1',
        dueDate: new Date(NOW.getTime() - 2 * DAY),
        item: { barcode: 'ZK-1', itemType: 'livre', record: { title: 'Droit foncier' } },
        patron: { id: 'pat-1', barcode: 'P-1', category: 'etudiant' },
      },
    ]);

    const result = await service.listOverdues(db, NOW);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      overdueDays: 2,
      accruedFineXof: 100, // 2 j × 50 FCFA
    });
  });

  it('patronSituation totalise amendes constatées + courantes', async () => {
    const service = new CirculationService();
    const db = makeDb();
    db.patron.findUnique.mockResolvedValue({ ...PATRON, user: null });
    db.circulationRule.findMany.mockResolvedValue([RULE]);
    db.checkout.aggregate.mockResolvedValue({ _sum: { fineAmount: 200 } });
    db.checkout.findMany.mockResolvedValue([
      {
        id: 'co-2',
        dueDate: new Date(NOW.getTime() - DAY), // 1 j de retard → 50 FCFA
        renewals: 0,
        item: { barcode: 'ZK-2', itemType: 'livre', record: { title: 'Anatomie' } },
      },
    ]);

    const result = await service.patronSituation(db, 'pat-1', NOW);

    expect(result.fines).toEqual({
      recordedXof: 200,
      accruingXof: 50,
      totalXof: 250,
    });
    expect(result.checkouts[0].overdue).toBe(true);
  });
});
