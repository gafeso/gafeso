import { PDFDocument } from 'pdf-lib';

/**
 * Garantit un xref PDF valide (levier backend n°1, mesuré au spike : sans un
 * xref valide, PDFium reconstruit la table par un scan complet du fichier et le
 * bornage mémoire du lecteur s'effondre).
 *
 * pdf-lib charge puis RÉ-SÉRIALISE le document : la sortie porte une table de
 * références croisées propre (xref classique, `useObjectStreams: false` = le
 * plus compatible avec PDFium). Si le PDF est illisible/irréparable, on lève une
 * erreur EXPLICITE — l'appelant décide (l'ingestion la consigne sans casser la
 * lecture en ligne).
 */
export async function ensureValidPdfXref(buffer: Buffer): Promise<Buffer> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch (error) {
    throw new Error(
      `PDF illisible / xref irréparable : ${(error as Error).message}`,
    );
  }
  try {
    const bytes = await doc.save({ useObjectStreams: false });
    return Buffer.from(bytes);
  } catch (error) {
    throw new Error(
      `Ré-sérialisation PDF (xref valide) impossible : ${(error as Error).message}`,
    );
  }
}
