import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import AdmZip from 'adm-zip';
import {
  computeMetadataPatch,
  MetadataExtractionService,
} from './metadata-extraction.service';

// ── Fixtures réelles (pas de mocks — on construit de vrais fichiers) ──

async function buildPdf(fields: {
  title?: string;
  author?: string;
  producer?: string;
  date?: Date;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  if (fields.title) doc.setTitle(fields.title);
  if (fields.author) doc.setAuthor(fields.author);
  if (fields.producer) doc.setProducer(fields.producer);
  if (fields.date) doc.setCreationDate(fields.date);
  return Buffer.from(await doc.save());
}

function buildEpub(options: {
  title?: string;
  creator?: string;
  language?: string;
  publisher?: string;
  date?: string;
  withCover?: boolean;
  epub2StyleCover?: boolean;
  malformed?: boolean;
}): Buffer {
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));

  if (options.malformed) {
    // Pas de META-INF/container.xml du tout.
    zip.addFile('OEBPS/content.opf', Buffer.from('<package></package>'));
    return zip.toBuffer();
  }

  zip.addFile(
    'META-INF/container.xml',
    Buffer.from(
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    ),
  );

  const dc = [
    options.title ? `<dc:title>${options.title}</dc:title>` : '',
    options.creator ? `<dc:creator>${options.creator}</dc:creator>` : '',
    options.language ? `<dc:language>${options.language}</dc:language>` : '',
    options.publisher ? `<dc:publisher>${options.publisher}</dc:publisher>` : '',
    options.date ? `<dc:date>${options.date}</dc:date>` : '',
  ].join('\n');

  const coverManifestItem = options.withCover
    ? options.epub2StyleCover
      ? '<item id="cover-img" href="cover.jpg" media-type="image/jpeg"/>'
      : '<item id="cover-img" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
    : '';
  const coverMeta =
    options.withCover && options.epub2StyleCover ? '<meta name="cover" content="cover-img"/>' : '';

  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(
      `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${dc}
    ${coverMeta}
  </metadata>
  <manifest>
    ${coverManifestItem}
  </manifest>
</package>`,
    ),
  );

  if (options.withCover) {
    zip.addFile('OEBPS/cover.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
  }

  return zip.toBuffer();
}

describe('MetadataExtractionService — PDF', () => {
  const service = new MetadataExtractionService();

  it('extrait titre, auteur, éditeur (producer) et année depuis un vrai PDF', async () => {
    const pdf = await buildPdf({
      title: 'Droit constitutionnel burkinabè',
      author: 'Traoré, Awa',
      producer: 'Éditions du Sahel',
      date: new Date('2023-05-01'),
    });

    const result = await service.extract(pdf, 'PDF');

    expect(result.title).toBe('Droit constitutionnel burkinabè');
    expect(result.author).toBe('Traoré, Awa');
    expect(result.publisher).toBe('Éditions du Sahel');
    expect(result.publishYear).toBe(2023);
    expect(result.language).toBeNull(); // pas de langue standard dans le dictionnaire Info
    expect(result.cover).toBeNull(); // pas de couverture embarquée standard en PDF
  });

  it('un PDF sans métadonnées renvoie des champs null (pas d’exception)', async () => {
    const pdf = await buildPdf({});
    const result = await service.extract(pdf, 'PDF');
    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
  });

  it('un fichier PDF corrompu ne fait jamais échouer l’extraction', async () => {
    const result = await service.extract(Buffer.from('pas un vrai pdf'), 'PDF');
    expect(result.title).toBeNull();
    expect(result.cover).toBeNull();
  });

  it('assainit un octet nul embarqué dans le titre/auteur (rejeté par PostgreSQL sinon)', async () => {
    const NUL = String.fromCharCode(0);
    const pdf = await buildPdf({
      title: `Thèse EXEMPLE${NUL} corrompue`,
      author: `Auteur${NUL}`,
    });

    const result = await service.extract(pdf, 'PDF');

    expect(result.title).toBe('Thèse EXEMPLE corrompue');
    expect(result.title).not.toContain(NUL);
    expect(result.author).toBe('Auteur');
  });
});

describe('MetadataExtractionService — EPUB', () => {
  const service = new MetadataExtractionService();

  it('extrait les métadonnées Dublin Core depuis un vrai EPUB', async () => {
    const epub = buildEpub({
      title: 'Anthologie de la littérature burkinabè',
      creator: 'Sanogo, Alain',
      language: 'fr',
      publisher: 'Éditions du Sahel',
      date: '2017-03-01',
    });

    const result = await service.extract(epub, 'EPUB');

    expect(result.title).toBe('Anthologie de la littérature burkinabè');
    expect(result.author).toBe('Sanogo, Alain');
    expect(result.language).toBe('fr');
    expect(result.publisher).toBe('Éditions du Sahel');
    expect(result.publishYear).toBe(2017);
  });

  it('récupère la couverture EPUB3 (properties="cover-image")', async () => {
    const epub = buildEpub({ title: 'Titre', withCover: true });
    const result = await service.extract(epub, 'EPUB');
    expect(result.cover).not.toBeNull();
    expect(result.cover?.mimeType).toBe('image/jpeg');
    expect(result.cover?.buffer.length).toBeGreaterThan(0);
  });

  it('récupère la couverture EPUB2 (repli <meta name="cover">)', async () => {
    const epub = buildEpub({ title: 'Titre', withCover: true, epub2StyleCover: true });
    const result = await service.extract(epub, 'EPUB');
    expect(result.cover).not.toBeNull();
    expect(result.cover?.mimeType).toBe('image/jpeg');
  });

  it('un EPUB sans couverture renvoie cover: null', async () => {
    const epub = buildEpub({ title: 'Titre' });
    const result = await service.extract(epub, 'EPUB');
    expect(result.cover).toBeNull();
  });

  it('un EPUB malformé (sans container.xml) ne fait jamais échouer l’extraction', async () => {
    const epub = buildEpub({ malformed: true });
    const result = await service.extract(epub, 'EPUB');
    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
  });

  it('tronque une métadonnée anormalement longue (extraction aberrante)', async () => {
    const epub = buildEpub({ title: 'A'.repeat(600), creator: 'Auteur' });
    const result = await service.extract(epub, 'EPUB');
    expect(result.title?.length).toBe(500);
  });

  it('un fichier qui n’est pas un zip valide ne fait jamais échouer l’extraction', async () => {
    const result = await service.extract(Buffer.from('pas un epub'), 'EPUB');
    expect(result.title).toBeNull();
  });
});

describe('computeMetadataPatch — pré-remplissage non destructif', () => {
  const extracted = {
    title: 'Titre extrait',
    author: 'Auteur Extrait',
    language: 'en',
    publisher: 'Éditeur Extrait',
    publishYear: 2020,
    cover: null,
  };

  it('remplit les champs vides (author, publisher, publishYear)', () => {
    const patch = computeMetadataPatch(
      { author: null, publisher: null, publishYear: null, language: 'fr', coverUrl: null },
      extracted,
    );
    expect(patch).toEqual({
      author: 'Auteur Extrait',
      publisher: 'Éditeur Extrait',
      publishYear: 2020,
      language: 'en', // langue à sa valeur par défaut 'fr' → corrigée
    });
  });

  it('NE remplace JAMAIS un champ déjà renseigné (author, publisher, publishYear)', () => {
    const patch = computeMetadataPatch(
      {
        author: 'Auteur déjà saisi',
        publisher: 'Éditeur déjà saisi',
        publishYear: 1999,
        language: 'es', // déjà corrigé manuellement, différent du défaut 'fr'
        coverUrl: null,
      },
      extracted,
    );
    expect(patch).toEqual({});
  });

  it('ne modifie pas la langue si elle n’est plus à sa valeur par défaut', () => {
    const patch = computeMetadataPatch(
      { author: null, publisher: null, publishYear: null, language: 'es', coverUrl: null },
      extracted,
    );
    expect(patch.language).toBeUndefined();
  });

  it('patch vide si rien n’a été extrait', () => {
    const patch = computeMetadataPatch(
      { author: null, publisher: null, publishYear: null, language: 'fr', coverUrl: null },
      { title: null, author: null, language: null, publisher: null, publishYear: null, cover: null },
    );
    expect(patch).toEqual({});
  });
});
