import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EnrollmentService, normalizeClassName } from './enrollment.service';

function makeDb() {
  const db: any = {
    schoolClass: {
      create: vi.fn(async ({ data }: any) => ({ id: 'cls-1', ...data })),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    enrollment: {
      upsert: vi.fn(async ({ create }: any) => ({ id: 'enr-1', ...create })),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    expectedStudent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  db.$transaction = vi.fn(async (cb: any) => cb(db));
  return db;
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('normalizeClassName', () => {
  it('normalise en MAJUSCULES_UNDERSCORE', () => {
    expect(normalizeClassName('l1 droit')).toBe('L1_DROIT');
    expect(normalizeClassName(' M2-Medecine ')).toBe('M2_MEDECINE');
    expect(normalizeClassName('L1_DROIT')).toBe('L1_DROIT');
  });
});

describe('EnrollmentService — classes', () => {
  let service: EnrollmentService;
  let db: any;

  beforeEach(() => {
    service = new EnrollmentService({} as never);
    db = makeDb();
  });

  it('crée une classe avec nom normalisé', async () => {
    const cls = await service.createClass(db, { name: 'l1 droit', label: 'Licence 1 Droit', level: 'l1' });
    expect(cls.name).toBe('L1_DROIT');
    expect(cls.level).toBe('L1');
  });

  it('nom en double → 409', async () => {
    db.schoolClass.create.mockRejectedValue(p2002());
    await expect(service.createClass(db, { name: 'L1_DROIT' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('renommage répercuté sur la classe active des étudiants', async () => {
    db.schoolClass.findUnique.mockResolvedValue({ id: 'cls-1', name: 'L1_DROIT' });
    await service.updateClass(db, 'cls-1', { name: 'L1_DROIT_PRIVE' });
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { className: 'L1_DROIT' },
      data: { className: 'L1_DROIT_PRIVE' },
    });
  });

  it('suppression refusée si inscriptions rattachées', async () => {
    db.schoolClass.findUnique.mockResolvedValue({
      id: 'cls-1',
      _count: { enrollments: 4 },
    });
    await expect(service.deleteClass(db, 'cls-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('suppression REFUSÉE si des règles d’accès référencent la classe', async () => {
    // Sans ce garde, la règle survivait en pointant vers une classe disparue :
    // elle ne correspondait plus jamais à personne, en silence. Le défaut de
    // la classe en texte libre rentrait par la porte de la suppression.
    db.schoolClass.findUnique.mockResolvedValue({
      id: 'cls-1',
      name: 'L1_DROIT',
      _count: { enrollments: 0 },
    });
    const prisma = {
      accessRule: {
        findMany: vi.fn().mockResolvedValue([
          { collection: { name: 'Fonds numérique' } },
          { collection: { name: 'Réserve Droit' } },
        ]),
      },
    };
    const svc = new EnrollmentService(prisma as never);

    await expect(svc.deleteClass(db, 'cls-1', 'tenant-1')).rejects.toThrow(
      /règle\(s\) d.accès référencent la classe/,
    );
    // Le message doit NOMMER les collections : sans elles, l'administrateur ne
    // sait pas où aller corriger.
    await expect(svc.deleteClass(db, 'cls-1', 'tenant-1')).rejects.toThrow(
      /Fonds numérique.*Réserve Droit/,
    );
    expect(db.schoolClass.delete).not.toHaveBeenCalled();
  });

  it('suppression AUTORISÉE si aucune règle ne la référence', async () => {
    db.schoolClass.findUnique.mockResolvedValue({
      id: 'cls-2',
      name: 'M2_OBSOLETE',
      _count: { enrollments: 0 },
    });
    const prisma = { accessRule: { findMany: vi.fn().mockResolvedValue([]) } };
    const svc = new EnrollmentService(prisma as never);

    await expect(svc.deleteClass(db, 'cls-2', 'tenant-1')).resolves.toEqual({
      deleted: true,
    });
    expect(db.schoolClass.delete).toHaveBeenCalled();
  });

  it('listClasses ajoute l’effectif actif par classe', async () => {
    db.schoolClass.findMany.mockResolvedValue([
      { id: 'c1', name: 'L1_DROIT', _count: { enrollments: 5 } },
      { id: 'c2', name: 'M2_MEDECINE', _count: { enrollments: 2 } },
    ]);
    db.user.groupBy.mockResolvedValue([
      { className: 'L1_DROIT', _count: { _all: 3 } },
    ]);

    const result = await service.listClasses(db);

    expect(result[0].activeStudents).toBe(3);
    expect(result[1].activeStudents).toBe(0);
  });
});

describe('EnrollmentService — inscriptions', () => {
  let service: EnrollmentService;
  let db: any;

  const STUDENT = { id: 'user-1', role: 'STUDENT', className: null };

  beforeEach(() => {
    service = new EnrollmentService({} as never);
    db = makeDb();
    db.user.findUnique.mockResolvedValue({ ...STUDENT });
    db.schoolClass.findUnique.mockResolvedValue({ id: 'cls-1', name: 'L1_DROIT' });
  });

  it('inscrit et met à jour la classe active (lue par access-control)', async () => {
    const result = await service.enrollStudent(db, {
      userId: 'user-1',
      className: 'l1 droit',
      academicYear: '2026-2027',
    });

    expect(result.className).toBe('L1_DROIT');
    expect(db.enrollment.upsert.mock.calls[0][0].create).toMatchObject({
      userId: 'user-1',
      classId: 'cls-1',
      academicYear: '2026-2027',
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { className: 'L1_DROIT' },
    });
  });

  it('ré-inscription la même année = changement de classe (upsert)', async () => {
    await service.enrollStudent(db, {
      userId: 'user-1',
      className: 'L1_DROIT',
      academicYear: '2026-2027',
    });
    const upsertArg = db.enrollment.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({
      userId_academicYear: { userId: 'user-1', academicYear: '2026-2027' },
    });
    expect(upsertArg.update).toEqual({ classId: 'cls-1' });
  });

  it('refuse un compte non étudiant (400)', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'user-2', role: 'LIBRARIAN' });
    await expect(
      service.enrollStudent(db, {
        userId: 'user-2',
        className: 'L1_DROIT',
        academicYear: '2026-2027',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('classe inconnue → 404', async () => {
    db.schoolClass.findUnique.mockResolvedValue(null);
    await expect(
      service.enrollStudent(db, {
        userId: 'user-1',
        className: 'GHOST',
        academicYear: '2026-2027',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('désinscription : efface la classe active si c’était celle-là', async () => {
    db.enrollment.findUnique.mockResolvedValue({
      id: 'enr-1',
      userId: 'user-1',
      schoolClass: { name: 'L1_DROIT' },
      user: { className: 'L1_DROIT' },
    });

    await service.unenrollStudent(db, 'enr-1');

    expect(db.enrollment.delete).toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { className: null },
    });
  });

  it('désinscription : ne touche pas la classe active si différente', async () => {
    db.enrollment.findUnique.mockResolvedValue({
      id: 'enr-1',
      userId: 'user-1',
      schoolClass: { name: 'L1_DROIT' },
      user: { className: 'M2_MEDECINE' }, // déjà déplacé ailleurs
    });
    await service.unenrollStudent(db, 'enr-1');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('expectedStudentsOfClass : total et réclamés', async () => {
    db.expectedStudent.findMany.mockResolvedValue([
      { matricule: 'E1', claimed: true },
      { matricule: 'E2', claimed: false },
      { matricule: 'E3', claimed: true },
    ]);
    const result = await service.expectedStudentsOfClass(db, 'l1 droit');
    expect(result).toMatchObject({ className: 'L1_DROIT', total: 3, claimed: 2 });
  });
});
