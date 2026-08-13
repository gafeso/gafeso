import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildLabelsPdf, LabelData } from './label-pdf';

function makeLabels(n: number): LabelData[] {
  return Array.from({ length: n }, (_, i) => ({
    barcode: `EXEMPLE-${String(i).padStart(6, '0')}`,
    callNumber: '342.5 TRA',
    title: `Titre de démonstration numéro ${i}`,
    sigle: 'BUC',
  }));
}

describe('buildLabelsPdf', () => {
  it('produit un PDF valide (signature %PDF) avec du contenu', async () => {
    const bytes = await buildLabelsPdf(makeLabels(3));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('une planche 3×8 tient sur une page jusqu’à 24 étiquettes, 2 pages au-delà', async () => {
    const one = await PDFDocument.load(await buildLabelsPdf(makeLabels(24)));
    expect(one.getPageCount()).toBe(1);
    const two = await PDFDocument.load(await buildLabelsPdf(makeLabels(25)));
    expect(two.getPageCount()).toBe(2);
  });

  it('le décalage « démarrer à N » pousse sur la page suivante', async () => {
    // start=23 (offset 22) + 4 étiquettes → cases 22,23 (page 1) puis 24,25 (page 2).
    const pdf = await PDFDocument.load(
      await buildLabelsPdf(makeLabels(4), { start: 23 }),
    );
    expect(pdf.getPageCount()).toBe(2);
  });

  it('grille personnalisée (2×4 = 8/page) pagine correctement', async () => {
    const pdf = await PDFDocument.load(
      await buildLabelsPdf(makeLabels(9), { columns: 2, rows: 4 }),
    );
    expect(pdf.getPageCount()).toBe(2);
  });

  it('titre très long et cote absente ne font pas échouer', async () => {
    const bytes = await buildLabelsPdf([
      { barcode: 'ZK-000124', callNumber: null, title: 'X'.repeat(300), sigle: 'BUC' },
    ]);
    expect(bytes.length).toBeGreaterThan(500);
  });
});
