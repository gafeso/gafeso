import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import bwipjs from 'bwip-js';
import * as QRCode from 'qrcode';

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
  /**
   * L'adresse publique de la NOTICE — ce que le QR fait ouvrir. `null` : pas de
   * QR sur cette étiquette, et le code-barres reprend toute la largeur.
   *
   * ⚠ C'est l'adresse de la notice, pas de l'exemplaire : un lecteur qui scanne
   * veut la fiche du document, pas le volume qu'il tient. Les exemplaires n'ont
   * pas de page publique.
   */
  shortUrl?: string | null;
}

/**
 * 🔴 LA LARGEUR DE MODULE MINIMALE DU CODE-BARRES, EN MILLIMÈTRES.
 *
 * ⚠ C'EST L'INVARIANT DE CETTE PLANCHE, et le QR lui est SUBORDONNÉ. Les
 * douchettes en service chez un établissement CLIENT lisent le code-barres ;
 * un QR qui le
 * rétrécirait sous le seuil rendrait le fonds illisible par le matériel
 * existant, pour un gain d'affichage.
 *
 * 0,25 mm est le minimum couramment admis pour du Code 128 lu par un scanneur
 * de comptoir (GS1 recommande 0,25 mm pour la lecture générale). En dessous, la
 * lecture dépend de l'imprimante et de l'état de l'étiquette — c'est-à-dire
 * qu'elle cesse d'être garantie.
 *
 * ⭐ CONSÉQUENCE : si réserver la place du QR ferait passer le module sous ce
 * seuil, **le QR n'est pas dessiné**. Ce n'est pas une dégradation silencieuse :
 * c'est la bonne priorité, et `buildLabelsPdf` le RAPPORTE à son appelant.
 */
export const LARGEUR_MODULE_MIN_MM = 0.25;

/** Côté du QR, et l'écart qui le sépare du code-barres. */
const QR_COTE_MM = 13;
const QR_ECART_MM = 2;

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

/**
 * L'échelle de rendu du code-barres, NOMMÉE.
 *
 * ⚠ Elle sert deux fois : au rendu, et au calcul du nombre de MODULES
 * (`largeur en pixels / échelle`). Recopier `3` au second endroit serait une
 * chaîne recopiée qui ne se voit pas : le jour où on monte la densité, le
 * seuil de lisibilité deviendrait faux sans que rien ne le dise.
 */
const ECHELLE_CODE_BARRES = 3;

/** Génère le PNG d'un code-barres Code 128 (buffer), sans texte intégré. */
async function code128Png(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: ECHELLE_CODE_BARRES, // densité suffisante pour rester net à l'impression
    height: 8, // hauteur du motif (unités bwip) — barres bien lisibles
    includetext: false, // on écrit le code en clair nous-mêmes, sous le motif
    paddingwidth: 0,
    paddingheight: 0,
  });
}

/**
 * Le QR d'une étiquette — correction HAUTE, parce qu'une étiquette se salit.
 *
 * ⚠ `margin: 0` : la marge blanche du QR est dessinée par la mise en page, pas
 * par l'image. Laisser bwip/qrcode la poser rétrécirait le motif utile à
 * l'intérieur du carré réservé, donc sa lisibilité, sans que le carré change.
 */
async function qrPngPourEtiquette(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 0,
    width: 512,
  });
}

/**
 * Construit le PDF. Les étiquettes remplissent la grille de gauche à droite puis
 * de haut en bas, en sautant les `start-1` premières cases (planche entamée), et
 * en paginant automatiquement au-delà de columns×rows par page.
 */
/**
 * Ce que la planche rapporte EN PLUS du PDF.
 *
 * ⚠ Le type est enrichi plutôt que le défaut tu. « Une fonction qui ne peut pas
 * accomplir son office ne doit pas sortir comme si elle l'avait accompli » :
 * abandonner un QR est une décision, et une décision se rapporte.
 */
export interface PlancheEtiquettes {
  pdf: Uint8Array;
  /**
   * Les code-barres pour lesquels le QR a été ABANDONNÉ : y réserver sa place
   * aurait fait passer le module sous `LARGEUR_MODULE_MIN_MM`. Le code-barres
   * a été préféré, parce que c'est lui que les douchettes lisent.
   */
  qrAbandonnes: string[];
}

export async function buildLabelsPdf(
  labels: LabelData[],
  layoutInput: Partial<LabelLayout> = {},
): Promise<PlancheEtiquettes> {
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
  const qrCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  /**
   * ⚠ LES ÉTIQUETTES OÙ LE QR A ÉTÉ ABANDONNÉ — rapportées, jamais tues.
   *
   * Un QR qui disparaît sans un mot est une dégradation silencieuse : la
   * bibliothécaire imprime sa planche, trouve une étiquette sans QR, et ne peut
   * pas savoir si c'est un défaut ou une décision. On le DIT.
   */
  const qrAbandonnes: string[] = [];

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

    // ⭐ LA PLACE DU QR EST DEMANDÉE, PAS PRISE.
    //
    // On calcule d'abord ce que le code-barres mesurerait AVEC le QR. S'il
    // passe sous `LARGEUR_MODULE_MIN_MM`, le QR est abandonné pour cette
    // étiquette et le code-barres reprend toute la largeur — l'inverse
    // rendrait le fonds illisible par les douchettes en service.
    //
    // ⚠ `entry.image.width` est en PIXELS à l'échelle de rendu (`scale: 3`
    // dans `code128Png`) : le nombre de MODULES est donc cette largeur divisée
    // par l'échelle. Confondre les deux donnerait un seuil trois fois trop
    // permissif, et le défaut ne se verrait qu'à la douchette.
    const modules = entry.image.width / ECHELLE_CODE_BARRES;
    const boxPlein = cellW - 2 * pad;
    const boxAvecQr = boxPlein - (QR_COTE_MM + QR_ECART_MM) * MM;
    const qrDemande = Boolean(label.shortUrl);
    const qrTient = boxAvecQr / modules >= LARGEUR_MODULE_MIN_MM * MM;
    const avecQr = qrDemande && qrTient;
    if (qrDemande && !qrTient) qrAbandonnes.push(label.barcode);

    const boxW = avecQr ? boxAvecQr : boxPlein;
    const boxH = cellH * 0.42;
    const scale = Math.min(boxW / entry.image.width, boxH / entry.image.height);
    const drawW = entry.image.width * scale;
    const drawH = entry.image.height * scale;
    const barcodeY = cellTop - cellH * 0.5 - drawH / 2 + 4;
    // Centré dans SA boîte : à gauche quand le QR occupe la droite.
    const barcodeX = avecQr
      ? cellLeft + pad + (boxAvecQr - drawW) / 2
      : cellLeft + (cellW - drawW) / 2;
    page.drawImage(entry.image, {
      x: barcodeX,
      y: barcodeY,
      width: drawW,
      height: drawH,
    });

    if (avecQr) {
      let qr = qrCache.get(label.shortUrl as string);
      if (!qr) {
        qr = await pdf.embedPng(await qrPngPourEtiquette(label.shortUrl as string));
        qrCache.set(label.shortUrl as string, qr);
      }
      const cote = QR_COTE_MM * MM;
      page.drawImage(qr, {
        x: cellLeft + cellW - pad - cote,
        // Aligné sur le MILIEU du code-barres, pas sur son bas : les deux
        // motifs se lisent alors comme une paire.
        y: barcodeY + drawH / 2 - cote / 2,
        width: cote,
        height: cote,
      });
    }

    // Code en clair, centré sous le motif — et sous SA boîte, pas sous la
    // cellule : décalé, il ne se lirait plus comme la légende du code-barres.
    const codeText = fitText(label.barcode, mono, 8, boxW);
    const codeW = mono.widthOfTextAtSize(codeText, 8);
    page.drawText(codeText, {
      x: avecQr
        ? cellLeft + pad + (boxAvecQr - codeW) / 2
        : cellLeft + (cellW - codeW) / 2,
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

  return { pdf: await pdf.save(), qrAbandonnes };
}
