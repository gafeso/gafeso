import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { ROLES_SYSTEME } from '../auth/functions';

function makeDb() {
  return {
    role: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ id: 'role-new', ...data })),
      update: vi.fn(async ({ data }: any) => ({ id: 'role-1', ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue({ id: 'u1' }),
      update: vi.fn(async ({ data }: any) => ({ id: 'u1', ...data })),
    },
  } as any;
}

describe('RolesService — rôles système', () => {
  it('ensureSystemRoles seed les 5 rôles système (upsert idempotent par nom)', async () => {
    const db = makeDb();
    await new RolesService().ensureSystemRoles(db);
    expect(db.role.upsert).toHaveBeenCalledTimes(ROLES_SYSTEME.length);
    const names = db.role.upsert.mock.calls.map((c: any) => c[0].where.name);
    expect(names).toContain('Bibliothécaire');
    expect(names).toContain('Administrateur');
  });
});

describe('RolesService — CRUD', () => {
  let service: RolesService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    service = new RolesService();
    db = makeDb();
  });

  it('create : valide les codes de fonctions contre le catalogue', async () => {
    await expect(
      service.create(db, { name: 'X', functions: ['fonction.inventee'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.role.create).not.toHaveBeenCalled();
  });

  it('create : refuse un nom déjà pris', async () => {
    db.role.findUnique.mockResolvedValue({ id: 'role-1', name: 'Documentaliste' });
    await expect(
      service.create(db, { name: 'Documentaliste', functions: [] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create : déduplique les fonctions et force isSystem=false', async () => {
    const created = await service.create(db, {
      name: 'Documentaliste',
      functions: ['document.lire', 'document.lire', 'catalogue.gerer'],
    });
    expect(created.functions).toEqual(['document.lire', 'catalogue.gerer']);
    expect(created.isSystem).toBe(false);
  });

  it('update : refuse un rôle système', async () => {
    db.role.findUnique.mockResolvedValue({ id: 'role-1', isSystem: true });
    await expect(
      service.update(db, 'role-1', { functions: ['document.lire'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove : refuse un rôle système', async () => {
    db.role.findUnique.mockResolvedValue({ id: 'role-1', isSystem: true });
    await expect(service.remove(db, 'role-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('remove : refuse un rôle encore assigné à des comptes', async () => {
    db.role.findUnique.mockResolvedValue({ id: 'role-1', isSystem: false });
    db.user.count.mockResolvedValue(3);
    await expect(service.remove(db, 'role-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.role.delete).not.toHaveBeenCalled();
  });

  it('remove : supprime un rôle personnalisé non assigné', async () => {
    db.role.findUnique.mockResolvedValue({ id: 'role-1', isSystem: false });
    expect(await service.remove(db, 'role-1')).toEqual({ removed: true });
  });
});

describe('RolesService — assignation', () => {
  let service: RolesService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    service = new RolesService();
    db = makeDb();
  });

  it('assigne un rôle personnalisé sans toucher à l’enum historique', async () => {
    db.role.findUnique.mockResolvedValue({
      id: 'role-1',
      name: 'Documentaliste',
      isSystem: false,
    });
    await service.assignRole(db, 'u1', 'role-1');
    expect(db.user.update.mock.calls[0][0].data).toEqual({ roleId: 'role-1' });
  });

  it('assigner un rôle système synchronise l’enum historique', async () => {
    db.role.findUnique.mockResolvedValue({
      id: 'role-g',
      name: 'Gestionnaire',
      isSystem: true,
    });
    await service.assignRole(db, 'u1', 'role-g');
    expect(db.user.update.mock.calls[0][0].data).toEqual({
      roleId: 'role-g',
      role: 'MANAGER',
    });
  });

  it('roleId null retire le rôle dynamique (retour au repli enum)', async () => {
    await service.assignRole(db, 'u1', null);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ roleId: null });
  });

  it('compte introuvable → 404', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.assignRole(db, 'ghost', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rôle introuvable → 404', async () => {
    db.role.findUnique.mockResolvedValue(null);
    await expect(service.assignRole(db, 'u1', 'ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
