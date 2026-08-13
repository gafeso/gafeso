import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import bwipjs from 'bwip-js';

/**
 * Génération d'une planche A4 d'étiquettes code-barres, prête à imprimer sur
 * des feuilles autocollantes. Pur (aucune dépendance NestJS/Prisma) → testable
 * en isolation. Code-barres en **Code 128** (bwip-js) car les codes réels de la
 * bibliothèque sont alphanumériques (« BIB-000123 », « ZK-000124 »).
 *
 * Libs : pdf-lib (déjà présent, 100 % JS) + bwip-js (zéro dépendance, maintenu).
 */

export interface LabelData {
  barcode: string;
  callNumber: string | null;
  title: string;
  /** Sigle de l'établissement (ex. « BUC »). */
  sigle: string;
}

export interface LabelLayout {
  /** Colonnes × lignes de la grille. */
  columns: number;
  rows: number;
  /** Marges de la planche (mm). */
  marginTopMm: number;
  marginLeftMm: number;
  /** Espacement entre étiquettes (mm). */
  columnGapMm: number;
  rowGapMm: number;
  /** Démarrer à la N-ième étiquette (1-based) pour finir une planche entamée. */
  start: number;
}

const MM = 72 / 25.4; // 1 mm en points PDF
const A4 = { w: 210 * MM, h: 297 * MM };

export const DEFAULT_LAYOUT: LabelLayout = {
  columns: 3,
  rows: 8,
  marginTopMm: 13.5,
  marginLeftMm: 7,
  columnGapMm: 2.5,
  rowGapMm: 0,
  start: 1,
};

/** Tronque un texte pour qu'il tienne dans `maxWidth` à la taille donnée. */
function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = '…';
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + ellipsis, size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + ellipsis;
}

/** Génère le PNG d'un code-barres Code 128 (buffer), sans texte intégré. */
async function code128Png(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3, // densité suffisante pour rester net à l'impression
    height: 8, // hauteur du motif (unités bwip) — barres bien lisibles
    includetext: false, // on écrit le code en clair nous-mêmes, sous le motif
    paddingwidth: 0,
    paddingheight: 0,
  });
}

/**
 * Construit le PDF. Les étiquettes remplissent la grille de gauche à droite puis
 * de haut en bas, en sautant les `start-1` premières cases (planche entamée), et
 * en paginant automatiquement au-delà de columns×rows par page.
 */
export async function buildLabelsPdf(
  labels: LabelData[],
  layoutInput: Partial<LabelLayout> = {},
): Promise<Uint8Array> {
  const layout: LabelLayout = { ...DEFAULT_LAYOUT, ...layoutInput };
  const { columns, rows } = layout;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const marginLeft = layout.marginLeftMm * MM;
  const marginTop = layout.marginTopMm * MM;
  const colGap = layout.columnGapMm * MM;
  const rowGap = layout.rowGapMm * MM;

  // Dimensions d'une étiquette : on remplit la zone imprimable (marges
  // symétriques haut/bas et gauche/droite) avec la grille demandée.
  const cellW = (A4.w - 2 * marginLeft - (columns - 1) * colGap) / columns;
  const cellH = (A4.h - 2 * marginTop - (rows - 1) * rowGap) / rows;
  const perPage = columns * rows;

  const pad = 3 * MM;
  let page = pdf.addPage([A4.w, A4.h]);

  // Cache des PNG code-barres (une notice peut réapparaître ; évite de
  // régénérer le même motif).
  const pngCache = new Map<string, { image: Awaited<ReturnType<typeof pdf.embedPng>> }>();

  // La case globale `slot` inclut le décalage de départ ; le modulo donne la
  // position sur la page courante.
  const startOffset = Math.max(0, layout.start - 1);

  for (let i = 0; i < labels.length; i++) {
    const slot = startOffset + i;
    const pageIndex = Math.floor(slot / perPage);
    const cellOnPage = slot % perPage;
    if (pageIndex > pdf.getPageCount() - 1) {
      page = pdf.addPage([A4.w, A4.h]);
    }

    const col = cellOnPage % columns;
    const row = Math.floor(cellOnPage / columns);
    const cellLeft = marginLeft + col * (cellW + colGap);
    // Origine PDF en bas à gauche : la 1re ligne est en HAUT de la page.
    const cellTop = A4.h - marginTop - row * (cellH + rowGap);

    const label = labels[i];

    // En-tête : sigle à gauche, cote à droite.
    const headerY = cellTop - pad - 6;
    page.drawText(fitText(label.sigle, bold, 7, cellW / 2 - pad), {
      x: cellLeft + pad,
      y: headerY,
      size: 7,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });
    if (label.callNumber) {
      const cote = fitText(label.callNumber, font, 7, cellW / 2 - pad);
      const w = font.widthOfTextAtSize(cote, 7);
      page.drawText(cote, {
        x: cellLeft + cellW - pad - w,
        y: headerY,
        size: 7,
        font,
        color: rgb(0.25, 0.25, 0.25),
      });
    }

    // Code-barres (image PNG ajustée dans une boîte, ratio préservé).
    let entry = pngCache.get(label.barcode);
    if (!entry) {
      const png = await code128Png(label.barcode);
      entry = { image: await pdf.embedPng(png) };
      pngCache.set(label.barcode, entry);
    }
    const boxW = cellW - 2 * pad;
    const boxH = cellH * 0.42;
    const scale = Math.min(boxW / entry.image.width, boxH / entry.image.height);
    const drawW = entry.image.width * scale;
    const drawH = entry.image.height * scale;
    const barcodeY = cellTop - cellH * 0.5 - drawH / 2 + 4;
    page.drawImage(entry.image, {
      x: cellLeft + (cellW - drawW) / 2,
      y: barcodeY,
      width: drawW,
      height: drawH,
    });

    // Code en clair, centré sous le motif.
    const codeText = fitText(label.barcode, mono, 8, cellW - 2 * pad);
    const codeW = mono.widthOfTextAtSize(codeText, 8);
    page.drawText(codeText, {
      x: cellLeft + (cellW - codeW) / 2,
      y: barcodeY - 9,
      size: 8,
      font: mono,
      color: rgb(0, 0, 0),
    });

    // Titre tronqué, centré en bas de l'étiquette.
    const titleText = fitText(label.title, font, 6.5, cellW - 2 * pad);
    const titleW = font.widthOfTextAtSize(titleText, 6.5);
    page.drawText(titleText, {
      x: cellLeft + (cellW - titleW) / 2,
      y: cellTop - cellH + pad,
      size: 6.5,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return pdf.save();
}
