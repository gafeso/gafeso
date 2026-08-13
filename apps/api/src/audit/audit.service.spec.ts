import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service';
import { AUDIT_ACTIONS } from './audit.actions';

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'a1' }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

describe('AuditService — écriture non bloquante', () => {
  it('écrit une entrée avec les champs fournis', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as any);
    await service.log({
      tenantId: 't1',
      actorId: 'u1',
      actorEmail: 'a@x.fr',
      action: AUDIT_ACTIONS.ROLE_UPDATE,
      targetType: 'role',
      targetId: 'r1',
      ip: '1.2.3.4',
      metadata: { functions: ['roles.gerer'] },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        actorId: 'u1',
        actorEmail: 'a@x.fr',
        action: 'role.update',
        targetType: 'role',
        targetId: 'r1',
        ip: '1.2.3.4',
      }),
    });
  });

  it('NE JETTE JAMAIS si l’écriture échoue (l’action métier ne doit pas casser)', async () => {
    const prisma = makePrisma({
      auditLog: { create: vi.fn().mockRejectedValue(new Error('DB down')) },
    });
    const service = new AuditService(prisma as any);
    // Ne doit pas rejeter malgré l'échec de create.
    await expect(
      service.log({ action: AUDIT_ACTIONS.LOGIN_SUCCESS }),
    ).resolves.toBeUndefined();
  });

  it('champs absents → null (jamais undefined en base)', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as any);
    await service.log({ action: AUDIT_ACTIONS.LOGOUT });
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(data.tenantId).toBeNull();
    expect(data.actorId).toBeNull();
    expect(data.targetId).toBeNull();
  });
});

describe('AuditService — consultation filtrée', () => {
  it('borne TOUJOURS au tenant et applique les filtres action/acteur/période', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as any);
    const from = new Date('2026-07-01');
    const to = new Date('2026-07-31');
    await service.list({
      tenantId: 't1',
      action: 'auth.login.success',
      actor: 'gestion',
      from,
      to,
      page: 2,
      limit: 25,
    });
    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.action).toBe('auth.login.success');
    expect(where.actorEmail).toEqual({ contains: 'gestion', mode: 'insensitive' });
    expect(where.createdAt).toEqual({ gte: from, lte: to });
    // pagination
    expect(prisma.auditLog.findMany.mock.calls[0][0].skip).toBe(25);
    expect(prisma.auditLog.findMany.mock.calls[0][0].take).toBe(25);
  });

  it('sans filtre optionnel : seul tenantId contraint', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as any);
    await service.list({ tenantId: 't1', page: 1, limit: 50 });
    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ tenantId: 't1' });
  });
});
