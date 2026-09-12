import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ⚠ Client tenant exigé par `getRecordAccessStatus` depuis P6-4 : l'embargo vit
 * sur la notice, donc dans le schéma de l'école. Ici aucune notice n'est sous
 * embargo — ces cas éprouvent les règles de classe et de palier, pas l'embargo,
 * qui a sa propre suite (`embargo.spec.ts`).
 */
const dbSansEmbargo = { biblioRecord: { findUnique: vi.fn(async () => null) } } as never;

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { StudentAccessContext } from './access-control.matching';

function makePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    collection: {
      create: vi.fn(async ({ data }: any) => ({ id: 'col-new', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: 'col-1', tenantId: null, type: 'INTERNAL' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    collectionTitle: {
      upsert: vi.fn().mockResolvedValue({ id: 'ct-1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    accessRule: {
      create: vi.fn(async ({ data }: any) => ({ id: 'rule-new', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  return Object.assign(prisma, overrides);
}

function makeService(prisma = makePrisma()) {
  return { service: new AccessControlService(prisma as any), prisma };
}

const ctx: StudentAccessContext = {
  tenantId: 'school-1',
  className: 'L1_DROIT',
  subscriptionTier: 'free',
};

describe('AccessControlService — filtrage étudiant', () => {
  it('getVisibleCollections ne renvoie que les collections accessibles, règles retirées', async () => {
    const prisma = makePrisma();
    prisma.collection.findMany.mockResolvedValue([
      {
        id: 'col-accessible',
        name: 'Droit L1',
        accessRules: [
          { tenantId: 'school-1', className: 'L1_DROIT', subscriptionTier: null },
        ],
        titles: [],
      },
      {
        id: 'col-autre-classe',
        name: 'Médecine M2',
        accessRules: [
          { tenantId: 'school-1', className: 'M2_MEDECINE', subscriptionTier: null },
        ],
        titles: [],
      },
    ]);
    const { service } = makeService(prisma);

    const result = await service.getVisibleCollections(ctx);

    expect(result.map((c: any) => c.id)).toEqual(['col-accessible']);
    // Les règles ne doivent pas fuiter dans la réponse
    expect((result[0] as any).accessRules).toBeUndefined();
    // Pré-filtrage par école demandé en base
    expect(prisma.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accessRules: { some: { tenantId: 'school-1' } } },
      }),
    );
  });

  it('getVisibleCollections filtre aussi sur le palier d’abonnement', async () => {
    const prisma = makePrisma();
    prisma.collection.findMany.mockResolvedValue([
      {
        id: 'col-premium',
        name: 'Premium',
        accessRules: [
          { tenantId: 'school-1', className: null, subscriptionTier: 'premium' },
        ],
        titles: [],
      },
    ]);
    const { service } = makeService(prisma);

    // étudiant "free" → ne voit pas la collection premium
    expect((await service.getVisibleCollections(ctx)).length).toBe(0);
    // étudiant "premium" → la voit
    const premiumCtx = { ...ctx, subscriptionTier: 'premium' };
    expect((await service.getVisibleCollections(premiumCtx)).length).toBe(1);
  });

  it('canAccessTitle : vrai si le titre est dans une collection accessible', async () => {
    const prisma = makePrisma();
    prisma.collectionTitle.findMany.mockResolvedValue([
      {
        collection: {
          accessRules: [
            { tenantId: 'school-1', className: 'L1_DROIT', subscriptionTier: null },
          ],
        },
      },
    ]);
    const { service } = makeService(prisma);
    expect(await service.canAccessTitle(ctx, 'title-1')).toBe(true);
  });

  it('canAccessTitle : faux si aucune collection ne correspond', async () => {
    const prisma = makePrisma();
    prisma.collectionTitle.findMany.mockResolvedValue([
      {
        collection: {
          accessRules: [
            { tenantId: 'school-1', className: 'M2_MEDECINE', subscriptionTier: null },
          ],
        },
      },
    ]);
    const { service } = makeService(prisma);
    expect(await service.canAccessTitle(ctx, 'title-1')).toBe(false);
  });

  it('getRecordAccessStatus : accordé si une collection matche', async () => {
    const prisma = makePrisma();
    prisma.collectionTitle.findMany.mockResolvedValue([
      {
        collection: {
          accessRules: [
            { tenantId: 'school-1', className: 'L1_DROIT', subscriptionTier: null },
          ],
        },
      },
    ]);
    const { service } = makeService(prisma);
    expect(await service.getRecordAccessStatus(dbSansEmbargo, ctx, 'rec-1')).toEqual({ granted: true });
  });

  it('getRecordAccessStatus : refusé avec message clair (classe) quand seule la classe bloque', async () => {
    const prisma = makePrisma();
    prisma.collectionTitle.findMany.mockResolvedValue([
      {
        collection: {
          accessRules: [
            { tenantId: 'school-1', className: 'M2_MEDECINE', subscriptionTier: null },
          ],
        },
      },
    ]);
    const { service } = makeService(prisma);
    expect(await service.getRecordAccessStatus(dbSansEmbargo, ctx, 'rec-1')).toEqual({
      granted: false,
      code: 'CLASS_MISMATCH',
      requiredClassName: 'M2_MEDECINE',
      message: 'Réservé aux étudiants de M2_MEDECINE.',
    });
  });

  it('getRecordAccessStatus : refusé avec message clair (abonnement) quand seul le palier bloque', async () => {
    const prisma = makePrisma();
    prisma.collectionTitle.findMany.mockResolvedValue([
      {
        collection: {
          accessRules: [
            { tenantId: 'school-1', className: null, subscriptionTier: 'premium' },
          ],
        },
      },
    ]);
    const { service } = makeService(prisma);
    expect(await service.getRecordAccessStatus(dbSansEmbargo, ctx, 'rec-1')).toEqual({
      granted: false,
      code: 'SUBSCRIPTION_REQUIRED',
      requiredSubscriptionTier: 'premium',
      message: 'Abonnement requis (palier "premium").',
    });
  });

  it('getRecordAccessStatus : aucune règle configurée pour l’école → NOT_CONFIGURED', async () => {
    const prisma = makePrisma();
    prisma.collectionTitle.findMany.mockResolvedValue([]);
    const { service } = makeService(prisma);
    expect(await service.getRecordAccessStatus(dbSansEmbargo, ctx, 'rec-1')).toEqual({
      granted: false,
      code: 'NOT_CONFIGURED',
      message: 'Ce document n’est pas accessible pour votre école.',
    });
  });
});

describe('AccessControlService — isolation multi-tenant des collections', () => {
  it('createCollection : une collection INTERNAL est possédée dès sa création', async () => {
    const { service, prisma } = makeService();
    await service.createCollection(
      { name: 'Droit L1', type: 'INTERNAL' as any },
      'school-1',
    );
    expect(prisma.collection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'INTERNAL', tenantId: 'school-1' }),
    });
  });

  it('createCollection : une collection COMMERCIAL reste partagée (tenantId null)', async () => {
    const { service, prisma } = makeService();
    await service.createCollection(
      { name: 'Abonnement Médecine', type: 'COMMERCIAL' as any },
      'school-1',
    );
    expect(prisma.collection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'COMMERCIAL', tenantId: null }),
    });
  });

  it('listCollections : ne demande que ses propres collections internes + les partagées', async () => {
    const { service, prisma } = makeService();
    await service.listCollections('school-1');
    const where = prisma.collection.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      OR: [
        { type: 'INTERNAL', tenantId: 'school-1' },
        { type: { in: ['COMMERCIAL', 'EXTERNAL'] } },
      ],
    });
    // Le compteur de règles est filtré sur l'école courante (pas de fuite du
    // nombre de règles des autres écoles sur une collection partagée).
    const include = prisma.collection.findMany.mock.calls[0][0].include;
    expect(include.accessRules.where).toEqual({ tenantId: 'school-1' });
  });

  it('listCollections : le compteur de règles reflète les règles de l’école (pas le global)', async () => {
    const prisma = makePrisma();
    prisma.collection.findMany.mockResolvedValue([
      {
        id: 'col-1',
        name: 'Partagée',
        type: 'COMMERCIAL',
        tenantId: null,
        _count: { titles: 5 },
        accessRules: [{ id: 'r1' }], // seulement la règle de school-1
      },
    ]);
    const { service } = makeService(prisma);
    const result = await service.listCollections('school-1');
    expect(result[0]._count).toEqual({ titles: 5, accessRules: 1 });
    // accessRules ne fuite pas tel quel dans la réponse.
    expect((result[0] as any).accessRules).toBeUndefined();
  });

  it('getCollection : collection interne d’une autre école = introuvable (404)', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      type: 'INTERNAL',
      tenantId: 'school-2',
      titles: [],
      accessRules: [],
    });
    const { service } = makeService(prisma);
    await expect(service.getCollection('col-1', 'school-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getCollection : ne demande que les règles de l’école courante', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      type: 'INTERNAL',
      tenantId: 'school-1',
      titles: [],
      accessRules: [],
    });
    const { service } = makeService(prisma);
    await service.getCollection('col-1', 'school-1');
    const include = prisma.collection.findUnique.mock.calls[0][0].include;
    expect(include.accessRules.where).toEqual({ tenantId: 'school-1' });
  });

  it('getCollection : collection partagée (COMMERCIAL) accessible à toute école', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      type: 'COMMERCIAL',
      tenantId: null,
      titles: [],
      accessRules: [],
    });
    const { service } = makeService(prisma);
    await expect(service.getCollection('col-1', 'school-1')).resolves.toBeTruthy();
  });

  it('updateCollection : met à jour nom/description de sa propre collection', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      type: 'INTERNAL',
      tenantId: 'school-1',
    });
    prisma.collection.update = vi.fn(async ({ data }: any) => ({ id: 'col-1', ...data }));
    const { service } = makeService(prisma);

    await service.updateCollection('col-1', 'school-1', {
      name: 'Droit L1 (2026)',
      description: '',
    });
    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: 'col-1' },
      data: { name: 'Droit L1 (2026)', description: null },
    });
  });

  it('updateCollection : collection interne d’une autre école = introuvable (404)', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      type: 'INTERNAL',
      tenantId: 'school-2',
    });
    prisma.collection.update = vi.fn();
    const { service } = makeService(prisma);
    await expect(
      service.updateCollection('col-1', 'school-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it('addTitle : collection interne d’une autre école = introuvable (404)', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      type: 'INTERNAL',
      tenantId: 'school-2',
    });
    const { service } = makeService(prisma);
    await expect(
      service.addTitle('col-1', 'school-1', 'title-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.collectionTitle.upsert).not.toHaveBeenCalled();
  });
});

describe('AccessControlService — documents locaux (collections internes)', () => {
  it('addRecord : lie la collection à l’école au premier document (prise de possession atomique)', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      tenantId: null,
      type: 'INTERNAL',
    });
    const { service } = makeService(prisma);

    await service.addRecord('col-1', 'school-1', 'rec-1');

    expect(prisma.collection.updateMany).toHaveBeenCalledWith({
      where: { id: 'col-1', tenantId: null },
      data: { tenantId: 'school-1' },
    });
    expect(prisma.collectionTitle.upsert).toHaveBeenCalledWith({
      where: { collectionId_recordId: { collectionId: 'col-1', recordId: 'rec-1' } },
      create: { collectionId: 'col-1', recordId: 'rec-1' },
      update: {},
    });
  });

  it('addRecord : n’écrase pas le tenantId déjà fixé de la même école', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      tenantId: 'school-1',
      type: 'INTERNAL',
    });
    const { service } = makeService(prisma);

    await service.addRecord('col-1', 'school-1', 'rec-1');

    expect(prisma.collection.updateMany).not.toHaveBeenCalled();
  });

  it('addRecord : collection interne d’une autre école = introuvable (404, pas de confirmation d’existence)', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      tenantId: 'school-2',
      type: 'INTERNAL',
    });
    const { service } = makeService(prisma);

    await expect(service.addRecord('col-1', 'school-1', 'rec-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.collectionTitle.upsert).not.toHaveBeenCalled();
  });

  it('addRecord : refuse une collection COMMERCIAL/EXTERNAL (partagée, jamais réclamable)', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      tenantId: null,
      type: 'COMMERCIAL',
    });
    const { service } = makeService(prisma);

    await expect(service.addRecord('col-1', 'school-1', 'rec-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.collection.updateMany).not.toHaveBeenCalled();
    expect(prisma.collectionTitle.upsert).not.toHaveBeenCalled();
  });

  it('addRecord : course perdue sur la prise de possession → refus, rien n’est rattaché', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      tenantId: null,
      type: 'INTERNAL',
    });
    // Une autre école a réclamé la collection entre la lecture et l'écriture.
    prisma.collection.updateMany.mockResolvedValue({ count: 0 });
    const { service } = makeService(prisma);

    await expect(service.addRecord('col-1', 'school-1', 'rec-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.collectionTitle.upsert).not.toHaveBeenCalled();
  });

  it('addRecord : collection introuvable → 404', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue(null);
    const { service } = makeService(prisma);

    await expect(
      service.addRecord('ghost', 'school-1', 'rec-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removeRecord : collection interne d’une autre école = introuvable (404)', async () => {
    const prisma = makePrisma();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      tenantId: 'school-2',
      type: 'INTERNAL',
    });
    const { service } = makeService(prisma);

    await expect(
      service.removeRecord('col-1', 'school-1', 'rec-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.collectionTitle.deleteMany).not.toHaveBeenCalled();
  });
});

describe('AccessControlService — gestion', () => {
  let service: AccessControlService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    ({ service, prisma } = makeService());
  });

  it('addAccessRule injecte le tenant et normalise les jokers (undefined → null)', async () => {
    await service.addAccessRule('col-1', 'school-1', { className: 'L1_DROIT' });
    expect(prisma.accessRule.create).toHaveBeenCalledWith({
      data: {
        collectionId: 'col-1',
        tenantId: 'school-1',
        className: 'L1_DROIT',
        subscriptionTier: null,
      },
    });
  });

  it('addAccessRule échoue si la collection n’existe pas', async () => {
    prisma.collection.findUnique.mockResolvedValue(null);
    await expect(
      service.addAccessRule('ghost', 'school-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.accessRule.create).not.toHaveBeenCalled();
  });

  it('addAccessRule : collection interne d’une autre école = introuvable (404)', async () => {
    prisma.collection.findUnique.mockResolvedValue({
      id: 'col-1',
      tenantId: 'school-2',
      type: 'INTERNAL',
    });
    await expect(
      service.addAccessRule('col-1', 'school-1', { className: 'L1_DROIT' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.accessRule.create).not.toHaveBeenCalled();
  });

  it('removeAccessRule : règle d’une autre école = introuvable (404, pas de confirmation)', async () => {
    prisma.accessRule.findUnique.mockResolvedValue({
      id: 'rule-x',
      tenantId: 'school-2',
    });
    await expect(
      service.removeAccessRule('rule-x', 'school-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.accessRule.delete).not.toHaveBeenCalled();
  });

  it('removeAccessRule supprime bien la règle de sa propre école', async () => {
    prisma.accessRule.findUnique.mockResolvedValue({
      id: 'rule-1',
      tenantId: 'school-1',
    });
    const res = await service.removeAccessRule('rule-1', 'school-1');
    expect(res).toEqual({ removed: true });
    expect(prisma.accessRule.delete).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
    });
  });

  it('listAccessRules restreint à l’école courante', async () => {
    await service.listAccessRules('col-1', 'school-1');
    expect(prisma.accessRule.findMany).toHaveBeenCalledWith({
      where: { collectionId: 'col-1', tenantId: 'school-1' },
    });
  });
});
