import { randomBytes } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { decryptSegment, unwrapCekWithKek } from './content-crypto';
import { ContentIngestionService } from './content-ingestion.service';

async function makePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  page.drawText('Gafeso — test ingestion', { x: 20, y: 150, size: 12 });
  return Buffer.from(await doc.save());
}

describe('ContentIngestionService — ingestion PDF (xref valide + AEAD + CEK@repos)', () => {
  const kek = randomBytes(32);
  let storage: { putObject: ReturnType<typeof vi.fn>; deleteObject: ReturnType<typeof vi.fn> };
  let service: ContentIngestionService;
  let pdf: Buffer;

  beforeAll(async () => {
    pdf = await makePdf();
  });

  const build = () => {
    storage = { putObject: vi.fn().mockResolvedValue(undefined), deleteObject: vi.fn() };
    service = new ContentIngestionService(
      storage as never,
      { contentKek: kek } as never,
    );
  };

  it('produit un blob chiffré ; la CEK (déballée de la KEK) déchiffre → %PDF', async () => {
    build();
    const result = await service.ingestPdf('rec-1', pdf);

    // Métadonnées de chiffrement
    expect(result.encObjectKey).toMatch(/^rec-1\/enc\/.*\.gafs$/);
    expect(result.encSegSize).toBe(16384);
    expect(result.encAlgo).toBe('aead-seg-gcm-16k/v1');
    expect(result.xrefValidatedAt).toBeInstanceOf(Date);

    // Le blob a bien été déposé
    expect(storage.putObject).toHaveBeenCalledOnce();
    const [key, blob, mime] = storage.putObject.mock.calls[0];
    expect(key).toBe(result.encObjectKey);
    expect(mime).toBe('application/octet-stream');
    expect((blob as Buffer).subarray(0, 6)).toEqual(
      Buffer.from([0x47, 0x41, 0x46, 0x53, 0x31, 0x00]),
    );

    // CEK jamais en clair : on la RÉCUPÈRE via la KEK, puis on déchiffre le 1er
    // segment → doit commencer par %PDF (xref valide, ré-sérialisé par pdf-lib).
    const cek = unwrapCekWithKek(result.encWrappedCek, kek);
    const seg0 = decryptSegment(blob as Buffer, 0, cek);
    expect(seg0.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('la CEK n’apparaît jamais en clair dans le résultat', async () => {
    build();
    const result = await service.ingestPdf('rec-2', pdf);
    const cek = unwrapCekWithKek(result.encWrappedCek, kek);
    // La CEK en clair ne doit se trouver ni dans encWrappedCek ni ailleurs.
    expect(result.encWrappedCek).not.toContain(cek.toString('base64'));
  });

  it('PDF irréparable (octets non-PDF) → erreur EXPLICITE', async () => {
    build();
    await expect(service.ingestPdf('rec-3', Buffer.from('ceci n’est pas un pdf'))).rejects.toThrow(
      /xref irréparable|illisible/i,
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
