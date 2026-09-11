import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DigitalCopyService } from './digital-copy.service';
import { ExtractedFileMetadata } from './metadata-extraction.service';

function makeStorage() {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn().mockResolvedValue('https://minio.local/signed-url'),
    putCover: vi.fn().mockResolvedValue('https://minio.local/covers/rec-1.jpg'),
  };
}

const EMPTY_EXTRACTED: ExtractedFileMetadata = {
  title: null,
  author: null,
  language: null,
  publisher: null,
  publishYear: null,
  cover: null,
};

function makeExtraction(result: Partial<ExtractedFileMetadata> = {}) {
  return { extract: vi.fn().mockResolvedValue({ ...EMPTY_EXTRACTED, ...result }) };
}

function makeSearch() {
  return { indexRecords: vi.fn().mockResolvedValue(undefined) };
}

// Ingestion offline mockée : renvoie des métadonnées de chiffrement plausibles.
function makeIngestion() {
  return {
    ingestPdf: vi.fn().mockResolvedValue({
      encObjectKey: 'rec-1/enc/123.gafs',
      encWrappedCek: 'd3JhcHBlZC1jZWs=',
      encSegSize: 16384,
      encAlgo: 'aead-seg-gcm-16k/v1',
      xrefValidatedAt: new Date(),
      encryptedAt: new Date(),
    }),
  };
}

function makeDb(recordOverrides: Record<string, any> = {}) {
  return {
    biblioRecord: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'rec-1',
        author: null,
        publisher: null,
        publishYear: null,
        language: 'fr',
        coverUrl: null,
        title: 'Titre existant',
        digitalCopy: null,
        ...recordOverrides,
      }),
      update: vi.fn(async ({ data }: any) => ({
        id: 'rec-1',
        title: 'Titre existant',
        author: null,
        publisher: null,
        publishYear: null,
        language: 'fr',
        coverUrl: null,
        isbn: null,
        category: null,
        recordType: 'ouvrage',
        ...recordOverrides,
        ...data,
      })),
    },
    digitalCopy: {
      upsert: vi.fn(async ({ create }: any) => ({ id: 'dc-1', ...create })),
      update: vi.fn(async ({ data }: any) => ({ id: 'dc-1', ...data })),
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

function pdfFile(overrides: Partial<any> = {}) {
  return {
    buffer: Buffer.from('%PDF-1.4 contenu factice'),
    originalname: 'droit-constitutionnel.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    ...overrides,
  };
}

describe('DigitalCopyService — upload (stockage)', () => {
  let service: DigitalCopyService;
  let storage: ReturnType<typeof makeStorage>;
  let extraction: ReturnType<typeof makeExtraction>;
  let search: ReturnType<typeof makeSearch>;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    storage = makeStorage();
    extraction = makeExtraction();
    search = makeSearch();
    service = new DigitalCopyService(storage as any, extraction as any, search as any, makeIngestion() as any, {} as never);
    db = makeDb();
  });

  it('accepte un PDF, dépose l’objet et enregistre les métadonnées', async () => {
    const result = await service.upload(db, 'zinda', 'rec-1', pdfFile());

    expect(storage.putObject).toHaveBeenCalledTimes(1);
    const [key, , contentType] = storage.putObject.mock.calls[0];
    expect(key).toMatch(/^rec-1\//);
    expect(contentType).toBe('application/pdf');

    const upsertArg = db.digitalCopy.upsert.mock.calls[0][0];
    expect(upsertArg.create.fileFormat).toBe('PDF');
    expect(upsertArg.create.fileSizeBytes).toBe(1024);
    expect(result.digitalCopy.fileFormat).toBe('PDF');
  });

  it('accepte un EPUB (type MIME application/epub+zip)', async () => {
    const result = await service.upload(
      db,
      'zinda',
      'rec-1',
      // Un EPUB est une archive ZIP : le contenu doit en porter la signature.
      pdfFile({
        mimetype: 'application/epub+zip',
        originalname: 'roman.epub',
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
      }),
    );
    expect(result.digitalCopy.fileFormat).toBe('EPUB');
  });

  it('rejette un fichier dont le CONTENU ne correspond pas au format annoncé', async () => {
    // Le type MIME vient de l'en-tête multipart : il se déclare, il ne se
    // prouve pas. Un fichier texte annoncé PDF était accepté, stocké, puis
    // échouait silencieusement à l'ingestion hors-ligne.
    await expect(
      service.upload(
        db,
        'zinda',
        'rec-1',
        pdfFile({ buffer: Buffer.from('ceci n est pas un PDF') }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('rejette un PDF annoncé EPUB (format croisé)', async () => {
    await expect(
      service.upload(
        db,
        'zinda',
        'rec-1',
        pdfFile({ mimetype: 'application/epub+zip', originalname: 'faux.epub' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un type MIME non pris en charge (ex. image)', async () => {
    await expect(
      service.upload(db, 'zinda', 'rec-1', pdfFile({ mimetype: 'image/png' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('rejette un fichier vide', async () => {
    await expect(
      service.upload(db, 'zinda', 'rec-1', pdfFile({ size: 0 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un fichier de plus de 200 Mo', async () => {
    await expect(
      service.upload(db, 'zinda', 'rec-1', pdfFile({ size: 201 * 1024 * 1024 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('notice introuvable → 404, aucun upload tenté', async () => {
    db.biblioRecord.findUnique.mockResolvedValue(null);
    await expect(service.upload(db, 'zinda', 'ghost', pdfFile())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('un second upload remplace le fichier précédent (supprimé après coup)', async () => {
    db.biblioRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      author: null,
      publisher: null,
      publishYear: null,
      language: 'fr',
      coverUrl: null,
      title: 'Titre existant',
      digitalCopy: { objectKey: 'rec-1/old-file.pdf' },
    });

    await service.upload(db, 'zinda', 'rec-1', pdfFile());

    expect(storage.deleteObject).toHaveBeenCalledWith('rec-1/old-file.pdf');
    const putOrder = storage.putObject.mock.invocationCallOrder[0];
    const deleteOrder = storage.deleteObject.mock.invocationCallOrder[0];
    expect(putOrder).toBeLessThan(deleteOrder);
  });
});

describe('DigitalCopyService — pré-remplissage à partir des métadonnées extraites', () => {
  let storage: ReturnType<typeof makeStorage>;
  let search: ReturnType<typeof makeSearch>;

  beforeEach(() => {
    storage = makeStorage();
    search = makeSearch();
  });

  it('applique le patch (author/publisher/publishYear) et réindexe', async () => {
    const extraction = makeExtraction({
      author: 'Auteur du fichier',
      publisher: 'Éditeur du fichier',
      publishYear: 2021,
    });
    const service = new DigitalCopyService(storage as any, extraction as any, search as any, makeIngestion() as any, {} as never);
    const db = makeDb();

    const result = await service.upload(db, 'zinda', 'rec-1', pdfFile());

    const updateArg = db.biblioRecord.update.mock.calls[0][0];
    expect(updateArg.data).toMatchObject({
      author: 'Auteur du fichier',
      publisher: 'Éditeur du fichier',
      publishYear: 2021,
    });
    expect(result.record.author).toBe('Auteur du fichier');
    expect(search.indexRecords).toHaveBeenCalledTimes(1);
    expect(search.indexRecords.mock.calls[0][0]).toBe('zinda');
  });

  it('NE remplace PAS un champ déjà renseigné par le bibliothécaire', async () => {
    const extraction = makeExtraction({ author: 'Auteur du fichier', publishYear: 2021 });
    const service = new DigitalCopyService(storage as any, extraction as any, search as any, makeIngestion() as any, {} as never);
    const db = makeDb({ author: 'Auteur déjà saisi', publishYear: 1999 });

    await service.upload(db, 'zinda', 'rec-1', pdfFile());

    expect(db.biblioRecord.update).not.toHaveBeenCalled();
    expect(search.indexRecords).not.toHaveBeenCalled();
  });

  it('dépose la couverture extraite si la notice n’en a pas déjà une', async () => {
    const extraction = makeExtraction({
      cover: { buffer: Buffer.from([1, 2, 3]), mimeType: 'image/jpeg' },
    });
    const service = new DigitalCopyService(storage as any, extraction as any, search as any, makeIngestion() as any, {} as never);
    const db = makeDb();

    const result = await service.upload(db, 'zinda', 'rec-1', pdfFile());

    expect(storage.putCover).toHaveBeenCalledWith(
      'rec-1.jpeg',
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(result.record.coverUrl).toBe('https://minio.local/covers/rec-1.jpg');
  });

  it('NE remplace PAS une couverture déjà présente', async () => {
    const extraction = makeExtraction({
      cover: { buffer: Buffer.from([1, 2, 3]), mimeType: 'image/jpeg' },
    });
    const service = new DigitalCopyService(storage as any, extraction as any, search as any, makeIngestion() as any, {} as never);
    const db = makeDb({ coverUrl: 'https://deja-la.jpg' });

    await service.upload(db, 'zinda', 'rec-1', pdfFile());

    expect(storage.putCover).not.toHaveBeenCalled();
  });

  it('un échec inattendu de l’extraction ne fait jamais échouer l’upload (défense en profondeur)', async () => {
    const extraction = { extract: vi.fn().mockRejectedValue(new Error('fichier corrompu')) };
    const service = new DigitalCopyService(storage as any, extraction as any, search as any, makeIngestion() as any, {} as never);
    const db = makeDb();

    const result = await service.upload(db, 'zinda', 'rec-1', pdfFile());

    expect(storage.putObject).toHaveBeenCalled(); // le fichier est bien stocké
    expect(result.digitalCopy.fileFormat).toBe('PDF');
    expect(result.extractedMetadata.title).toBeNull(); // repli sur métadonnées vides
    expect(db.biblioRecord.update).not.toHaveBeenCalled(); // aucun patch à appliquer
  });

  it('un échec inattendu de l’écriture du patch (ex. valeur rejetée par PostgreSQL) ne fait jamais échouer l’upload', async () => {
    const extraction = makeExtraction({ author: 'Auteur du fichier' });
    const service = new DigitalCopyService(storage as any, extraction as any, search as any, makeIngestion() as any, {} as never);
    const db = makeDb();
    db.biblioRecord.update.mockRejectedValue(
      new Error('invalid byte sequence for encoding "UTF8": 0x00'),
    );

    const result = await service.upload(db, 'zinda', 'rec-1', pdfFile());

    expect(storage.putObject).toHaveBeenCalled(); // le fichier est bien stocké malgré tout
    expect(result.digitalCopy.fileFormat).toBe('PDF');
    expect(result.record.author).toBeNull(); // notice inchangée (patch non appliqué)
    expect(search.indexRecords).not.toHaveBeenCalled();
  });
});

describe('DigitalCopyService — métadonnées et téléchargement', () => {
  let service: DigitalCopyService;
  let storage: ReturnType<typeof makeStorage>;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    storage = makeStorage();
    service = new DigitalCopyService(storage as any, makeExtraction() as any, makeSearch() as any, makeIngestion() as any, {} as never);
    db = makeDb();
  });

  it('getMetadata renvoie 404 si aucun exemplaire numérique', async () => {
    await expect(service.getMetadata(db, 'rec-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getDownloadUrl renvoie une URL signée avec expiration 15 min', async () => {
    db.digitalCopy.findUnique.mockResolvedValue({
      objectKey: 'rec-1/file.pdf',
      originalName: 'file.pdf',
      fileFormat: 'PDF',
    });

    const result = await service.getDownloadUrl(db, 'rec-1');

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
      'rec-1/file.pdf',
      'file.pdf',
      900,
    );
    expect(result).toEqual({
      url: 'https://minio.local/signed-url',
      expiresInSeconds: 900,
      fileFormat: 'PDF',
    });
  });

  it('getDownloadUrl accepte une durée personnalisée (lecture en ligne)', async () => {
    db.digitalCopy.findUnique.mockResolvedValue({
      objectKey: 'rec-1/file.epub',
      originalName: 'file.epub',
      fileFormat: 'EPUB',
    });

    const result = await service.getDownloadUrl(db, 'rec-1', 2 * 3600);

    expect(storage.getSignedDownloadUrl).toHaveBeenCalledWith(
      'rec-1/file.epub',
      'file.epub',
      7200,
    );
    expect(result.expiresInSeconds).toBe(7200);
  });

  it('remove supprime la ligne puis l’objet MinIO', async () => {
    db.digitalCopy.findUnique.mockResolvedValue({ objectKey: 'rec-1/file.pdf' });
    const result = await service.remove(db, 'rec-1');
    expect(db.digitalCopy.delete).toHaveBeenCalledWith({ where: { recordId: 'rec-1' } });
    expect(storage.deleteObject).toHaveBeenCalledWith('rec-1/file.pdf');
    expect(result).toEqual({ deleted: true });
  });

  it('remove sur une notice sans exemplaire → 404', async () => {
    await expect(service.remove(db, 'rec-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
