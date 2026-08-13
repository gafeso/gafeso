import { describe, expect, it, vi } from 'vitest';
import { InventoryService } from './inventory.service';

type Item = {
  id: string;
  barcode: string;
  callNumber: string | null;
  location: string | null;
  status: string;
  record: { title: string };
};
type Scan = { id: string; sessionId: string; barcode: string; itemId: string | null; result: string };

const session = {
  id: 'sess-1',
  name: 'Récolement Documentation',
  scope: 'LOCATION',
  location: 'Documentation',
  status: 'OPEN',
};

/** Mock minimal du client tenant pour report()/scan(). */
function makeDb(items: Item[], scans: Scan[]) {
  const matchWhere = (it: Item, where: any) =>
    !where?.location || it.location === where.location;
  return {
    inventorySession: {
      findUnique: vi.fn(async () => session),
    },
    item: {
      findMany: vi.fn(async ({ where }: any) => items.filter((it) => matchWhere(it, where))),
      count: vi.fn(async ({ where }: any) => items.filter((it) => matchWhere(it, where)).length),
      findUnique: vi.fn(async ({ where }: any) =>
        items.find((it) => (where.barcode ? it.barcode === where.barcode : it.id === where.id)) ?? null,
      ),
    },
    inventoryScan: {
      findMany: vi.fn(async () => scans),
      findUnique: vi.fn(async ({ where }: any) =>
        scans.find((s) => s.barcode === where.sessionId_barcode.barcode) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `sc-${scans.length}`, ...data };
        scans.push(row);
        return row;
      }),
    },
  } as any;
}

const item = (id: string, barcode: string, location: string, status = 'AVAILABLE'): Item => ({
  id,
  barcode,
  callNumber: '342.5 TRA',
  location,
  status,
  record: { title: `Titre ${id}` },
});

const svc = new InventoryService({ log: vi.fn() } as any);

describe('InventoryService — scan (feedback douchette)', () => {
  it('classe chaque scan : vu / déjà / inconnu / hors périmètre / en prêt', async () => {
    const items = [
      item('A', 'DOC-1', 'Documentation'),
      item('B', 'DOC-2', 'Documentation', 'CHECKED_OUT'),
      item('C', 'RES-1', 'Réserve'),
    ];
    const db = makeDb(items, []);

    expect((await svc.scan(db, 'sess-1', 'DOC-1')).result).toBe('SEEN');
    expect((await svc.scan(db, 'sess-1', 'DOC-1')).result).toBe('ALREADY'); // re-scan
    expect((await svc.scan(db, 'sess-1', 'DOC-2')).result).toBe('ON_LOAN');
    expect((await svc.scan(db, 'sess-1', 'RES-1')).result).toBe('OUT_OF_SCOPE');
    expect((await svc.scan(db, 'sess-1', 'ZZZ')).result).toBe('UNKNOWN');
  });

  it('espaces autour du code sont ignorés (douchette)', async () => {
    const db = makeDb([item('A', 'DOC-1', 'Documentation')], []);
    expect((await svc.scan(db, 'sess-1', '  DOC-1\t')).result).toBe('SEEN');
  });
});

describe('InventoryService — report (classement final)', () => {
  it('classe vus / manquants / en prêt / inattendus, et jamais un prêt en manquant', async () => {
    const items = [
      item('A', 'DOC-1', 'Documentation'),
      item('B', 'DOC-2', 'Documentation'),
      item('C', 'DOC-3', 'Documentation', 'CHECKED_OUT'), // en prêt, non scanné
      item('D', 'DOC-4', 'Documentation'), // manquant (non scanné)
      item('E', 'RES-1', 'Réserve'), // hors périmètre
    ];
    const scans: Scan[] = [
      { id: 's1', sessionId: 'sess-1', barcode: 'DOC-1', itemId: 'A', result: 'SEEN' },
      { id: 's2', sessionId: 'sess-1', barcode: 'DOC-2', itemId: 'B', result: 'SEEN' },
      { id: 's3', sessionId: 'sess-1', barcode: 'ZZZ', itemId: null, result: 'UNKNOWN' },
      { id: 's4', sessionId: 'sess-1', barcode: 'RES-1', itemId: 'E', result: 'OUT_OF_SCOPE' },
    ];
    const r = await svc.report(makeDb(items, scans), 'sess-1');

    expect(r.seen.map((i) => i.barcode).sort()).toEqual(['DOC-1', 'DOC-2']);
    expect(r.missing.map((i) => i.barcode)).toEqual(['DOC-4']);
    expect(r.onLoan.map((i) => i.barcode)).toEqual(['DOC-3']);
    expect(r.unexpected.map((u) => u.barcode).sort()).toEqual(['RES-1', 'ZZZ']);
    expect(r.counts).toMatchObject({ seen: 2, missing: 1, onLoan: 1, unexpected: 2, expected: 4 });
  });

  it('CSV : entête + une ligne par exemplaire classé, avec BOM', async () => {
    const items = [item('A', 'DOC-1', 'Documentation'), item('D', 'DOC-4', 'Documentation')];
    const scans: Scan[] = [
      { id: 's1', sessionId: 'sess-1', barcode: 'DOC-1', itemId: 'A', result: 'SEEN' },
    ];
    const csv = await svc.reportCsv(makeDb(items, scans), 'sess-1');
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toContain('Catégorie;Code-barres;Cote;Titre;Localisation');
    expect(csv).toContain('Vu;DOC-1;');
    expect(csv).toContain('Manquant;DOC-4;');
  });
});
