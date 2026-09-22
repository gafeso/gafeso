/**
 * Le chemin BORNÉ du récolement — dette 44.
 *
 * Le récolement est la seule fonction du produit dont le périmètre nominal est
 * le fonds ENTIER. Ce fichier tient les trois propriétés qui font que le borner
 * ne fabrique pas un faux dispositif :
 *
 *   1. `counts` ne transporte AUCUNE liste, et ses nombres PARTITIONNENT ;
 *   2. les pages de `categorie` se recollent exactement, dans l'ordre ;
 *   3. ⭐ `markMissing` voit TOUS les manquants, quelle que soit la pagination.
 *
 * ⚠ La troisième est la raison d'être du fichier. La correction que le problème
 * « 2 Mo » appelle naturellement est un `take` sur `report()` ; comme
 * `markMissing` lisait `report.missing` pour AGIR, ce `take` aurait marqué une
 * partie des manquants en laissant croire que tout était fait — et la session
 * serait quand même passée à `APPLIED`, donc non rejouable.
 */
import { describe, expect, it, vi } from 'vitest';
import { InventoryService, CATEGORIES_RECOLEMENT } from './inventory.service';

type Item = {
  id: string;
  barcode: string;
  callNumber: string | null;
  location: string | null;
  status: string;
  record: { title: string };
};

const sessionClose = {
  id: 'sess-1',
  name: 'Récolement du fonds entier',
  scope: 'ALL',
  location: null,
  status: 'CLOSED',
};

/**
 * ⚠ Cette doublure ÉCHOUE BRUYAMMENT sur ce qu'elle ne couvre pas. Un repli
 * silencieux transformerait un oubli de doublure en défaut apparent du produit,
 * et on chercherait dans le code ce qui n'y est pas.
 */
function makeDb(items: Item[], scans: { itemId: string | null; barcode: string; result: string }[]) {
  const majs: { ids: string[] }[] = [];
  const db = {
    _majs: majs,
    inventorySession: {
      findUnique: vi.fn(async () => sessionClose),
      update: vi.fn(async () => sessionClose),
    },
    item: {
      findMany: vi.fn(async ({ where }: any) => {
        if (where?.id?.in) {
          const voulus = new Set<string>(where.id.in);
          // ⚠ On rend dans un ordre DIFFÉRENT de la tranche demandée : c'est ce
          // que fait PostgreSQL sur un `IN`, et c'est ce que `hydrater` doit
          // rattraper. Une doublure qui rendrait l'ordre demandé ne pourrait
          // pas distinguer un code qui réordonne d'un code qui ne le fait pas.
          return items.filter((i) => voulus.has(i.id)).reverse();
        }
        if (!where || Object.keys(where).length === 0) return items;
        throw new Error(`doublure : requête item.findMany non couverte — ${JSON.stringify(where)}`);
      }),
      updateMany: vi.fn(async ({ where }: any) => {
        majs.push({ ids: where.id.in });
        return { count: where.id.in.length };
      }),
    },
    inventoryScan: { findMany: vi.fn(async () => scans) },
  } as any;
  return db;
}

const svc = new InventoryService({ log: vi.fn() } as any);

/** 250 exemplaires, cote croissante — l'ordre du rapport est donc l'ordre d'insertion. */
function fonds(n: number, statut = 'AVAILABLE'): Item[] {
  return Array.from({ length: n }, (_, k) => ({
    id: `it-${String(k).padStart(4, '0')}`,
    barcode: `BIB-${String(k).padStart(6, '0')}`,
    callNumber: `A ${String(k).padStart(4, '0')}`,
    location: 'Magasin',
    status: statut,
    record: { title: `Titre ${k}` },
  }));
}

describe('récolement — les comptes seuls', () => {
  it('⚠ la réponse de `counts` ne porte AUCUNE liste', async () => {
    const items = fonds(250);
    const db = makeDb(items, [{ itemId: 'it-0000', barcode: 'BIB-000000', result: 'SEEN' }]);
    const r = await svc.counts(db, 'sess-1');

    // C'est la propriété qui fait tomber les 2 Mo : ce n'est pas que les listes
    // soient courtes, c'est qu'elles ne sont pas là.
    for (const cat of CATEGORIES_RECOLEMENT) {
      expect(r, `counts ne doit pas porter « ${cat} »`).not.toHaveProperty(cat);
    }
    const poids = Buffer.byteLength(JSON.stringify(r));
    expect(poids, `la réponse pèse ${poids} o pour 250 exemplaires`).toBeLessThan(1024);
  });

  it('⚠ les comptes PARTITIONNENT le périmètre — sinon un total ne veut rien dire', async () => {
    const items = [...fonds(200), ...fonds(50, 'CHECKED_OUT').map((i) => ({ ...i, id: `p-${i.id}` }))];
    const db = makeDb(items, [
      { itemId: 'it-0000', barcode: 'BIB-000000', result: 'SEEN' },
      { itemId: 'it-0001', barcode: 'BIB-000001', result: 'SEEN' },
      { itemId: null, barcode: 'INCONNU-1', result: 'UNKNOWN' },
    ]);
    const { counts } = await svc.counts(db, 'sess-1');

    expect(counts.expected).toBe(250);
    expect(counts.seen + counts.missing + counts.onLoan).toBe(counts.expected);
    expect(counts.seen).toBe(2);
    expect(counts.onLoan).toBe(50);
    expect(counts.missing).toBe(198);
    // `unexpected` est HORS partition : un scan qui ne tombe dans aucun
    // exemplaire du périmètre n'est pas un exemplaire du périmètre.
    expect(counts.unexpected).toBe(1);
  });
});

describe('récolement — une catégorie, paginée', () => {
  it('⚠ les pages se RECOLLENT exactement, et dans l’ordre du rapport', async () => {
    const items = fonds(250);
    const db = makeDb(items, []);

    const vues: string[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const r = await svc.categorie(db, 'sess-1', 'missing', page, 100);
      totalPages = r.totalPages;
      expect(r.total).toBe(250);
      vues.push(...(r.lignes as { barcode: string }[]).map((l) => l.barcode));
      page += 1;
    } while (page <= totalPages);

    expect(totalPages).toBe(3);
    // Recollées : ni trou, ni doublon, ni permutation.
    expect(vues).toEqual(items.map((i) => i.barcode));
    expect(new Set(vues).size).toBe(250);
  });

  it('⚠ une page est RÉORDONNÉE sur la tranche, pas sur ce que la base rend', async () => {
    // La doublure rend délibérément l'inverse de la tranche demandée.
    const items = fonds(10);
    const db = makeDb(items, []);
    const r = await svc.categorie(db, 'sess-1', 'missing', 2, 3);
    expect((r.lignes as { barcode: string }[]).map((l) => l.barcode)).toEqual([
      'BIB-000003',
      'BIB-000004',
      'BIB-000005',
    ]);
  });

  it('seule la PAGE est hydratée — pas le périmètre', async () => {
    const items = fonds(250);
    const db = makeDb(items, []);
    await svc.categorie(db, 'sess-1', 'missing', 1, 100);

    const hydratations = db.item.findMany.mock.calls.filter((c: any[]) => c[0]?.where?.id?.in);
    expect(hydratations).toHaveLength(1);
    expect(hydratations[0][0].where.id.in).toHaveLength(100);
  });

  it('`unexpected` se pagine aussi — un scan hors périmètre peut être massif', async () => {
    const scans = Array.from({ length: 30 }, (_, k) => ({
      itemId: null,
      barcode: `INCONNU-${k}`,
      result: 'UNKNOWN',
    }));
    const db = makeDb(fonds(5), scans);
    const r = await svc.categorie(db, 'sess-1', 'unexpected', 3, 10);
    expect(r.total).toBe(30);
    expect(r.totalPages).toBe(3);
    expect(r.lignes).toHaveLength(10);
  });
});

describe('⭐ markMissing voit TOUS les manquants — la propriété que la pagination menace', () => {
  const tenant = { id: 'ten-1' } as any;
  const user = { sub: 'u-1', email: 'bib@exemple.bf', role: 'LIBRARIAN' } as any;

  it('⚠ 250 manquants sont marqués, alors qu’une page en porterait 100', async () => {
    const items = fonds(250);
    const db = makeDb(items, []);
    const r = await svc.markMissing(db, tenant, 'sess-1', user);

    expect(r.marked).toBe(250);
    expect(db._majs).toHaveLength(1);
    expect(db._majs[0].ids).toHaveLength(250);
    // Et ce sont bien TOUS les exemplaires, pas les 250 premiers d'autre chose.
    expect(new Set(db._majs[0].ids)).toEqual(new Set(items.map((i) => i.id)));
  });

  it('⚠ et il ne passe JAMAIS par le chemin non borné', async () => {
    const items = fonds(120);
    const db = makeDb(items, []);
    const espion = vi.spyOn(svc, 'report');
    await svc.markMissing(db, tenant, 'sess-1', user);
    // `report()` est la route que quelqu'un bornera un jour par un `take`.
    // Si markMissing la rappelle, cette borne deviendra une troncature
    // silencieuse sur une écriture — et la session passera à APPLIED quand même.
    expect(espion).not.toHaveBeenCalled();
    espion.mockRestore();
  });
});
