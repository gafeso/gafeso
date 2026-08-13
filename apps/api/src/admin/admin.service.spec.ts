import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AdminService } from './admin.service';

const jwt = new JwtService({ secret: 'test-secret' });

function makePrisma(overrides: Record<string, any> = {}) {
  const tx: any = {
    tenant: {
      create: vi.fn(async ({ data }: any) => ({ id: 'tenant-1', ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    subscription: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    domain: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tenantSettings: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    // Socle par défaut créé dans la même transaction que le tenant.
    collection: {
      create: vi.fn(async ({ data }: any) => ({ id: 'coll-1', ...data })),
    },
  };
  const prisma: any = {
    tenant: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    // Classes d'exemple : écrites via un client lié au schéma de l'école.
    forTenant: vi.fn(() => ({
      schoolClass: { createMany: vi.fn().mockResolvedValue({ count: 5 }) },
    })),
    _tx: tx,
  };
  return Object.assign(prisma, overrides);
}

function makeCataloging(overrides: Record<string, any> = {}) {
  return Object.assign({ reindexAll: vi.fn().mockResolvedValue({ indexed: 0 }) }, overrides);
}

function makeService(prisma = makePrisma(), cataloging = makeCataloging()) {
  return {
    service: new AdminService(prisma as any, jwt, cataloging as any),
    prisma,
    tx: prisma._tx,
    cataloging,
  };
}

describe('AdminService — login super-admin', () => {
  it('émet un JWT super-admin sur identifiants valides', async () => {
    const hash = await bcrypt.hash('secret', 4);
    const prisma = makePrisma({
      superAdmin: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sa-1',
          email: 'super@gafeso.local',
          password: hash,
          name: 'Super Admin',
        }),
      },
    });
    const { service } = makeService(prisma);

    const result = await service.superAdminLogin('Super@Gafeso.local', 'secret');

    const payload = jwt.verify(result.accessToken);
    expect(payload).toMatchObject({ sub: 'sa-1', superAdmin: true });
    expect((result.superAdmin as any).password).toBeUndefined();
  });

  it('refuse un mot de passe erroné (401)', async () => {
    const hash = await bcrypt.hash('secret', 4);
    const prisma = makePrisma({
      superAdmin: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sa-1', email: 'x', password: hash, name: 'X' }),
      },
    });
    const { service } = makeService(prisma);
    await expect(service.superAdminLogin('x@y.z', 'mauvais')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuse un compte inconnu (401 identique)', async () => {
    const prisma = makePrisma({ superAdmin: { findUnique: vi.fn().mockResolvedValue(null) } });
    const { service } = makeService(prisma);
    await expect(service.superAdminLogin('ghost@y.z', 'x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AdminService — provisioning', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof makePrisma>;
  let tx: any;

  beforeEach(() => {
    ({ service, prisma, tx } = makeService());
  });

  it('crée le tenant puis exécute la DDL du schéma (schéma + 22 tables + 20 FK)', async () => {
    const result = await service.provisionTenant({
      name: 'Lycée Zinda',
      slug: 'zinda',
      domain: 'Zinda.Gafeso.bf',
    });

    expect(result.slug).toBe('zinda');
    // tenant créé avec settings + domaine (normalisé en minuscules)
    const createArg = tx.tenant.create.mock.calls[0][0];
    expect(createArg.data.slug).toBe('zinda');
    expect(createArg.data.settings).toEqual({ create: {} });
    expect(createArg.data.domains.create.domain).toBe('zinda.gafeso.bf');

    // 1 SCHEMA + 6 TYPE + 22 TABLE + 6 reciblages enum + 20 FK = 55 instructions DDL
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(55);
    const first = tx.$executeRawUnsafe.mock.calls[0][0];
    expect(first).toBe('CREATE SCHEMA "tenant_zinda"');

    // Resserré sur la vérité offline : les 2 tables + les 4 FK nommées ont bien
    // été exécutées (pas seulement un compte global).
    // ── Socle par défaut (bloc 4) ──
    // Une école neuve doit être utilisable SANS création manuelle préalable :
    // sans ce socle, il fallait créer une classe, une collection, y ajouter
    // les documents un par un, puis une règle, avant tout accès.
    expect(tx.collection.create).toHaveBeenCalledTimes(1);
    const coll = tx.collection.create.mock.calls[0][0].data;
    expect(coll.isDefault).toBe(true);
    expect(coll.tenantId).toBe('tenant-1');
    // Règle joker/joker : la portée est « tout membre actif de CETTE école »,
    // la connexion exigeant déjà un compte ACTIVE et les collections étant
    // filtrées par tenantId.
    expect(coll.accessRules.create).toEqual([
      { tenantId: 'tenant-1', className: null, subscriptionTier: null },
    ]);

    const executed: string[] = tx.$executeRawUnsafe.mock.calls.map((c: unknown[]) => c[0] as string);
    for (const table of ['devices', 'offline_licenses']) {
      expect(executed.some((s) => s.includes(`CREATE TABLE "tenant_zinda"."${table}"`))).toBe(true);
    }
    const offlineFkRefs = [
      ['devices', '"tenant_zinda"."users"("id")'],
      ['offline_licenses', '"tenant_zinda"."devices"("id")'],
      ['offline_licenses', '"tenant_zinda"."users"("id")'],
      ['offline_licenses', '"tenant_zinda"."biblio_records"("id")'],
    ];
    for (const [table, ref] of offlineFkRefs) {
      expect(
        executed.some(
          (s) =>
            s.includes(`ALTER TABLE "tenant_zinda"."${table}"`) &&
            s.includes('ADD CONSTRAINT') &&
            s.includes(`REFERENCES ${ref}`) &&
            s.includes('ON DELETE CASCADE'),
        ),
      ).toBe(true);
    }
  });

  it('refuse un slug déjà pris (409)', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'x', slug: 'zinda' });
    await expect(
      service.provisionTenant({ name: 'X', slug: 'zinda' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un slug invalide (400) sans toucher la base', async () => {
    await expect(
      service.provisionTenant({ name: 'X', slug: 'bad;slug' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});

// Toutes les valeurs d'enum déjà présentes (4e appel d'introspection de
// syncTenantSchema) → la synchro des valeurs d'enum n'ajoute rien.
const ALL_ENUM_ROWS = [
  ...['STUDENT', 'LIBRARIAN', 'MANAGER', 'ACQUISITIONS', 'ADMIN'].map((v) => ({ enum_name: 'UserRole', value: v })),
  ...['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].map((v) => ({ enum_name: 'AccountStatus', value: v })),
  ...['MARC21', 'UNIMARC'].map((v) => ({ enum_name: 'MarcFormat', value: v })),
  ...['AVAILABLE', 'CHECKED_OUT', 'ON_HOLD', 'IN_TRANSIT', 'DAMAGED', 'LOST', 'WITHDRAWN', 'MISSING'].map((v) => ({ enum_name: 'ItemStatus', value: v })),
  ...['PENDING', 'AVAILABLE', 'FULFILLED', 'CANCELLED', 'EXPIRED'].map((v) => ({ enum_name: 'HoldStatus', value: v })),
  ...['PDF', 'EPUB'].map((v) => ({ enum_name: 'DigitalFormat', value: v })),
];

describe('AdminService — sync-schema (colonnes ajoutées après coup)', () => {
  it('applique les colonnes manquantes détectées par introspection', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ id: 't1', slug: 'zinda' });
    // 1er appel : colonnes de `public` (avec la nouvelle colonne "publisher") ;
    // 2e appel : colonnes de `tenant_zinda` (sans elle) ;
    // 3e appel : index existants du schéma tenant (aucun → tous à créer).
    prisma.$queryRawUnsafe = vi
      .fn()
      .mockResolvedValueOnce([
        { table_name: 'biblio_records', column_name: 'publisher', type_decl: 'text', is_enum: false },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(ALL_ENUM_ROWS); // 4e appel : valeurs d'enum (toutes présentes)
    const { service } = makeService(prisma);

    const result = await service.syncTenantSchema('zinda');

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'ALTER TABLE "tenant_zinda"."biblio_records" ADD COLUMN "publisher" text',
    );
    // Les index manquants sont créés au passage (audit perf 2026-07-14).
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'CREATE INDEX IF NOT EXISTS "holds_record_id_status_idx" ON "tenant_zinda"."holds" ("record_id", "status")',
    );
    expect(result.applied).toBeGreaterThan(0);
  });

  it('ne touche à rien si aucune colonne ne manque', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ id: 't1', slug: 'zinda' });
    const sameColumns = [
      { table_name: 'biblio_records', column_name: 'title', type_decl: 'text', is_enum: false },
    ];
    // Tous les index attendus sont déjà présents → aucun CREATE INDEX non plus.
    const allIndexes = [
      { table_name: 'holds', columns: ['record_id', 'status'] },
      { table_name: 'holds', columns: ['patron_id'] },
      { table_name: 'items', columns: ['record_id'] },
      { table_name: 'checkouts', columns: ['patron_id', 'return_date'] },
      { table_name: 'checkouts', columns: ['checkout_date'] },
      { table_name: 'checkouts', columns: ['return_date'] },
    ];
    prisma.$queryRawUnsafe = vi
      .fn()
      .mockResolvedValueOnce(sameColumns)
      .mockResolvedValueOnce(sameColumns)
      .mockResolvedValueOnce(allIndexes)
      .mockResolvedValueOnce(ALL_ENUM_ROWS); // 4e appel : valeurs d'enum (toutes présentes)
    const { service } = makeService(prisma);

    await service.syncTenantSchema('zinda');

    const touched = prisma.$executeRawUnsafe.mock.calls.filter(([sql]: [string]) =>
      sql.includes('ADD COLUMN') || sql.includes('CREATE INDEX'),
    );
    expect(touched).toHaveLength(0);
  });

  it('école inconnue → 404', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    await expect(service.syncTenantSchema('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminService — déprovisioning', () => {
  it('supprime le schéma puis les lignes publiques', async () => {
    const { service, prisma, tx } = makeService();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', slug: 'zinda' });

    const res = await service.deprovisionTenant('zinda');

    expect(res).toEqual({ deprovisioned: true, slug: 'zinda' });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'DROP SCHEMA IF EXISTS "tenant_zinda" CASCADE',
    );
    expect(tx.domain.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
    });
    expect(tx.tenant.delete).toHaveBeenCalledWith({ where: { id: 'tenant-1' } });
  });

  it('échoue si l’école n’existe pas', async () => {
    const { service } = makeService();
    await expect(service.deprovisionTenant('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminService — réindexation Meilisearch', () => {
  it('délègue à CatalogingService.reindexAll sur le client tenant', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', slug: 'zinda' });
    prisma.forTenant = vi.fn().mockReturnValue({ marker: 'tenant-db' });
    const cataloging = makeCataloging({ reindexAll: vi.fn().mockResolvedValue({ indexed: 4 }) });
    const { service } = makeService(prisma, cataloging);

    const result = await service.reindexTenant('zinda');

    expect(result).toEqual({ indexed: 4 });
    expect(prisma.forTenant).toHaveBeenCalledWith('zinda');
    expect(cataloging.reindexAll).toHaveBeenCalledWith({ marker: 'tenant-db' }, 'zinda');
  });

  it('école inconnue → 404', async () => {
    const { service } = makeService();
    await expect(service.reindexTenant('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});
