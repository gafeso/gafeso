import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PatronsService } from './patrons.service';

function makeDb() {
  return {
    patron: {
      create: vi.fn(async ({ data }: any) => ({ id: 'pat-1', ...data })),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    checkout: { count: vi.fn().mockResolvedValue(0) },
    hold: { count: vi.fn().mockResolvedValue(0) },
  } as any;
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('PatronsService', () => {
  let service: PatronsService;
  let db: any;

  beforeEach(() => {
    service = new PatronsService();
    db = makeDb();
  });

  it('crée un adhérent (catégorie normalisée en minuscules)', async () => {
    const patron = await service.createPatron(db, {
      barcode: ' P-2026-0001 ',
      category: 'Etudiant',
    });
    expect(patron.barcode).toBe('P-2026-0001');
    expect(patron.category).toBe('etudiant');
  });

  it('refuse un code-barres déjà attribué (P2002 → 409)', async () => {
    db.patron.create.mockRejectedValue(p2002());
    await expect(
      service.createPatron(db, { barcode: 'P-1', category: 'etudiant' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('liaison à un compte : le user doit exister dans le schéma tenant', async () => {
    await expect(
      service.createPatron(db, {
        barcode: 'P-1',
        category: 'etudiant',
        userId: 'user-inconnu',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.patron.create).not.toHaveBeenCalled();

    db.user.findUnique.mockResolvedValue({ id: 'user-1' });
    const patron = await service.createPatron(db, {
      barcode: 'P-1',
      category: 'etudiant',
      userId: 'user-1',
    });
    expect(patron.userId).toBe('user-1');
  });

  it('getPatron enrichit avec prêts en cours et réservations actives', async () => {
    db.patron.findUnique.mockResolvedValue({ id: 'pat-1', barcode: 'P-1', user: null });
    db.checkout.count.mockResolvedValue(2);
    db.hold.count.mockResolvedValue(1);

    const result = await service.getPatron(db, 'pat-1');

    expect(result.openCheckouts).toBe(2);
    expect(result.activeHolds).toBe(1);
    expect(db.checkout.count).toHaveBeenCalledWith({
      where: { patronId: 'pat-1', returnDate: null },
    });
  });

  it('suppression refusée si prêts en cours', async () => {
    db.patron.findUnique.mockResolvedValue({ id: 'pat-1' });
    db.checkout.count.mockResolvedValue(1);
    await expect(service.deletePatron(db, 'pat-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.patron.delete).not.toHaveBeenCalled();
  });

  it('suppression refusée même si le prêt est déjà rendu (historique, clé étrangère RESTRICT)', async () => {
    // Un checkout rendu n'est plus "en cours" mais reste une ligne rattachée
    // à l'adhérent (checkouts.patron_id) — bug reproduit en réel : sans ce
    // contrôle, db.patron.delete() plantait en 500 (contrainte de clé
    // étrangère) au lieu de refuser proprement.
    db.patron.findUnique.mockResolvedValue({ id: 'pat-1' });
    db.checkout.count.mockResolvedValue(1); // prêt rendu, mais toujours compté (pas de filtre returnDate)
    await expect(service.deletePatron(db, 'pat-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.checkout.count).toHaveBeenCalledWith({ where: { patronId: 'pat-1' } });
    expect(db.patron.delete).not.toHaveBeenCalled();
  });

  it('suppression refusée si réservations actives', async () => {
    db.patron.findUnique.mockResolvedValue({ id: 'pat-1' });
    db.hold.count.mockResolvedValue(1);
    await expect(service.deletePatron(db, 'pat-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('suppression OK sans activité', async () => {
    db.patron.findUnique.mockResolvedValue({ id: 'pat-1' });
    expect(await service.deletePatron(db, 'pat-1')).toEqual({ deleted: true });
  });

  it('adhérent introuvable → 404', async () => {
    await expect(service.getPatron(db, 'ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('⚠ DÉLIER une carte de son compte — le geste qui n’existait pas', () => {
  // ⚠ `UpdatePatronDto` héritait de `PartialType(CreatePatronDto)` : tout
  // facultatif, mais AUCUN champ nullable. Une carte liée au mauvais compte ne
  // pouvait donc JAMAIS être déliée — et `cardForUser` part du compte pour
  // trouver la carte : l'étudiant voyait les prêts d'un autre, sans recours.
  //
  // Troisième `null` inexprimable du 12 septembre 2026, après l'embargo et les
  // dates de la fiche d'autorité.

  function service(patron: Record<string, unknown> = { id: 'p1' }) {
    const update = vi.fn(async (a: { where: unknown; data: Record<string, unknown> }) => a);
    const db = {
      patron: { findUnique: vi.fn(async () => patron), update },
      user: { findUnique: vi.fn(async () => ({ id: 'u1' })) },
    } as never;
    return { svc: new PatronsService(), db, update };
  }

  it('⚠ `null` DÉLIE la carte', async () => {
    const { svc, db, update } = service();
    await svc.updatePatron(db, 'p1', { userId: null });
    expect(update.mock.calls[0][0].data.userId).toBeNull();
  });

  it('un champ ABSENT laisse le lien intact', async () => {
    const { svc, db, update } = service();
    await svc.updatePatron(db, 'p1', { category: 'personnel' });
    expect(update.mock.calls[0][0].data.userId).toBeUndefined();
  });

  it('⚠ et `null` sur la date de validité rend la carte illimitée', async () => {
    // Une carte expirée refuse TOUT prêt : une date posée par erreur privait
    // l'adhérent du service jusqu'à une intervention en base.
    const { svc, db, update } = service();
    await svc.updatePatron(db, 'p1', { expiryDate: null });
    expect(update.mock.calls[0][0].data.expiryDate).toBeNull();
  });

  it('délier n’interroge PAS les comptes — `null` n’est pas un identifiant', async () => {
    const { svc, db } = service();
    await svc.updatePatron(db, 'p1', { userId: null });
    const users = (db as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }).user;
    expect(users.findUnique).not.toHaveBeenCalled();
  });
});
