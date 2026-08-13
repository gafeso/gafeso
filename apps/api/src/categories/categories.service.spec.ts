import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

function makeDb(overrides: Record<string, any> = {}) {
  const db: any = {
    category: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ id: 'cat-new', ...data })),
      update: vi.fn(async ({ data }: any) => ({ id: 'cat-1', ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    biblioRecord: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
  };
  return Object.assign(db, overrides);
}

function makeCataloging() {
  return { toSearchDoc: vi.fn((r: any) => ({ id: r.id, category: r.category })) };
}

function makeSearch() {
  return { indexRecords: vi.fn().mockResolvedValue(undefined) };
}

function makeService(db = makeDb(), cataloging = makeCataloging(), search = makeSearch()) {
  return {
    service: new CategoriesService(cataloging as any, search as any),
    db,
    cataloging,
    search,
  };
}

describe('CategoriesService — création', () => {
  it('normalise le nom (espaces réduits, minuscules)', async () => {
    const { service, db } = makeService();
    const created = await service.create(db, { name: '  Droit  Public  ' });
    expect(created.name).toBe('droit public');
  });

  it('refuse une catégorie déjà existante (après normalisation)', async () => {
    const { service, db } = makeService();
    db.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'medecine' });
    await expect(service.create(db, { name: 'Medecine' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.category.create).not.toHaveBeenCalled();
  });
});

describe('CategoriesService — seed des catégories standard', () => {
  it('crée les 28 catégories sur un tenant vierge, normalisées comme la saisie manuelle', async () => {
    const { service, db } = makeService();
    const result = await service.seedDefaults(db);

    expect(result).toEqual({ created: 28, skipped: 0, total: 28 });
    expect(db.category.create).toHaveBeenCalledTimes(28);
    // Même normalisation que create() : minuscules, espaces réduits.
    const names = db.category.create.mock.calls.map((c: any) => c[0].data.name);
    expect(names).toContain('économie');
    expect(names).toContain("gestion de l'entreprise et services auxiliaires");
  });

  it("n'ajoute que les manquantes — comparaison sans casse ni accents", async () => {
    const { service, db } = makeService();
    // « economie » (sans accent) doit bloquer « Économie » ; « droit » bloque « Droit ».
    db.category.findMany.mockResolvedValue([
      { id: 'c1', name: 'economie' },
      { id: 'c2', name: 'droit' },
      { id: 'c3', name: 'MÉDECINE' },
    ]);
    const result = await service.seedDefaults(db);

    expect(result).toEqual({ created: 25, skipped: 3, total: 28 });
    const names = db.category.create.mock.calls.map((c: any) => c[0].data.name);
    expect(names).not.toContain('économie');
    expect(names).not.toContain('droit');
    expect(names).not.toContain('médecine');
  });

  it('rejouable : ne recrée rien si tout existe déjà (idempotent)', async () => {
    const { service, db } = makeService();
    const first = await service.seedDefaults(db);
    // Relance avec l'état résultant du premier passage.
    db.category.findMany.mockResolvedValue(
      first.created > 0
        ? db.category.create.mock.calls.map((c: any, i: number) => ({
            id: `c${i}`,
            name: c[0].data.name,
          }))
        : [],
    );
    db.category.create.mockClear();

    const second = await service.seedDefaults(db);
    expect(second).toEqual({ created: 0, skipped: 28, total: 28 });
    expect(db.category.create).not.toHaveBeenCalled();
  });

  it('ne supprime ni ne renomme jamais rien', async () => {
    const { service, db } = makeService();
    db.category.findMany.mockResolvedValue([{ id: 'c1', name: 'catégorie maison' }]);
    await service.seedDefaults(db);
    expect(db.category.delete).not.toHaveBeenCalled();
    expect(db.category.update).not.toHaveBeenCalled();
  });
});

describe('CategoriesService — renommage', () => {
  let service: CategoriesService;
  let db: ReturnType<typeof makeDb>;
  let search: ReturnType<typeof makeSearch>;

  beforeEach(() => {
    const made = makeService();
    service = made.service;
    db = made.db;
    search = made.search;
  });

  it('catégorie introuvable → 404', async () => {
    db.category.findUnique.mockResolvedValue(null);
    await expect(
      service.update(db, 'zinda', 'ghost', { name: 'droit' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sans nom fourni, ne change rien', async () => {
    db.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'droit' });
    const result = await service.update(db, 'zinda', 'cat-1', {});
    expect(result).toEqual({ id: 'cat-1', name: 'droit' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuse de fusionner avec une catégorie existante', async () => {
    db.category.findUnique
      .mockResolvedValueOnce({ id: 'cat-1', name: 'droit' }) // require()
      .mockResolvedValueOnce({ id: 'cat-2', name: 'medecine' }); // clash
    await expect(
      service.update(db, 'zinda', 'cat-1', { name: 'Medecine' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('répercute le renommage sur les notices et réindexe', async () => {
    db.category.findUnique
      .mockResolvedValueOnce({ id: 'cat-1', name: 'droit' }) // require()
      .mockResolvedValueOnce(null); // pas de clash
    db.biblioRecord.findMany.mockResolvedValue([
      { id: 'r1', category: 'droit public' },
      { id: 'r2', category: 'droit public' },
    ]);

    await service.update(db, 'zinda', 'cat-1', { name: 'Droit  Public' });

    expect(db.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { name: 'droit public' },
    });
    expect(db.biblioRecord.updateMany).toHaveBeenCalledWith({
      where: { category: 'droit' },
      data: { category: 'droit public' },
    });
    expect(db.biblioRecord.findMany).toHaveBeenCalledWith({
      where: { category: 'droit public' },
      // Include complet : le document Meilisearch est remplacé en entier.
      include: {
        contributors: { orderBy: { position: 'asc' } },
        keywords: { include: { keyword: true } },
      },
    });
    expect(search.indexRecords).toHaveBeenCalledWith('zinda', [
      { id: 'r1', category: 'droit public' },
      { id: 'r2', category: 'droit public' },
    ]);
  });
});

describe('CategoriesService — suppression', () => {
  it('refuse si des notices portent encore la catégorie', async () => {
    const { service, db } = makeService();
    db.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'droit' });
    db.biblioRecord.count.mockResolvedValue(4);
    await expect(service.remove(db, 'cat-1')).rejects.toBeInstanceOf(ConflictException);
    expect(db.category.delete).not.toHaveBeenCalled();
  });

  it('supprime une catégorie inutilisée', async () => {
    const { service, db } = makeService();
    db.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'droit' });
    expect(await service.remove(db, 'cat-1')).toEqual({ removed: true });
    expect(db.category.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
  });

  it('catégorie introuvable → 404', async () => {
    const { service, db } = makeService();
    await expect(service.remove(db, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});
