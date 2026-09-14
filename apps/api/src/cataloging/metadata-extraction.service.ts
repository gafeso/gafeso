import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

/** Métadonnées extraites d'un fichier numérique — tous les champs sont best-effort. */
export interface ExtractedFileMetadata {
  title: string | null;
  author: string | null;
  language: string | null;
  publisher: string | null;
  publishYear: number | null;
  /** Couverture embarquée, si trouvée (EPUB uniquement pour l'instant). */
  cover: { buffer: Buffer; mimeType: string } | null;
}

/** Champs de BiblioRecord concernés par le pré-remplissage automatique. */
export interface RecordFieldsForPrefill {
  author: string | null;
  publisher: string | null;
  publishYear: number | null;
  language: string;
  coverUrl: string | null;
}

export interface MetadataPatch {
  author?: string;
  publisher?: string;
  publishYear?: number;
  language?: string;
}

/**
 * Calcule les champs à pré-remplir automatiquement à partir des métadonnées
 * extraites, SANS JAMAIS écraser une valeur déjà saisie par le
 * bibliothécaire :
 *  - author / publisher / publishYear : uniquement si le champ est vide (null) ;
 *  - language : le champ n'est jamais null (défaut 'fr' en base) — on ne le
 *    corrige que s'il est encore à sa valeur par défaut 'fr' ET que le
 *    fichier indique une autre langue (sentinelle « non renseigné
 *    délibérément », pas une vraie détection d'absence) ;
 *  - title : jamais auto-appliqué (toujours déjà renseigné, obligatoire à la
 *    création de la notice) — reste visible dans le résultat d'extraction
 *    pour information, à appliquer manuellement si besoin.
 */
export function computeMetadataPatch(
  record: RecordFieldsForPrefill,
  extracted: ExtractedFileMetadata,
): MetadataPatch {
  const patch: MetadataPatch = {};
  if (!record.author && extracted.author) patch.author = extracted.author;
  if (!record.publisher && extracted.publisher) patch.publisher = extracted.publisher;
  if (!record.publishYear && extracted.publishYear) {
    patch.publishYear = extracted.publishYear;
  }
  if (record.language === 'fr' && extracted.language && extracted.language !== 'fr') {
    patch.language = extracted.language;
  }
  return patch;
}

const EMPTY_METADATA: ExtractedFileMetadata = {
  title: null,
  author: null,
  language: null,
  publisher: null,
  publishYear: null,
  cover: null,
};

const COVER_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/** Première année (4 chiffres) trouvée dans une chaîne. */
function yearFrom(value: string | null | undefined): number | null {
  const match = value?.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

// PostgreSQL (encodage UTF8) refuse l'octet nul dans un texte — fréquent
// dans un champ Info PDF tronqué/mal terminé, ou une métadonnée EPUB
// corrompue. Les autres caractères de contrôle sont écartés par prudence
// (jamais légitimes dans un titre/auteur/éditeur) ; la longueur est bornée
// contre une extraction aberrante depuis un fichier corrompu.
// eslint-disable-next-line no-control-regex -- ces caracteres sont precisement ceux a ecarter, pas une erreur de saisie
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_METADATA_FIELD_LENGTH = 500;

function sanitizeExtractedText(value: string): string {
  return value.replace(CONTROL_CHARS_RE, '').trim().slice(0, MAX_METADATA_FIELD_LENGTH);
}

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = sanitizeExtractedText(value);
  return cleaned ? cleaned : null;
}

/**
 * Extraction de métadonnées embarquées — jamais bloquante : un fichier
 * corrompu ou sans métadonnées renvoie simplement des champs null, l'upload
 * (brique 1) réussit toujours. Le bibliothécaire corrige ensuite la notice
 * pré-remplie via l'édition existante (PATCH /cataloging/records/:id).
 */
@Injectable()
export class MetadataExtractionService {
  private readonly logger = new Logger(MetadataExtractionService.name);

  async extract(buffer: Buffer, format: 'PDF' | 'EPUB'): Promise<ExtractedFileMetadata> {
    try {
      return format === 'PDF'
        ? await this.extractFromPdf(buffer)
        : this.extractFromEpub(buffer);
    } catch (error) {
      this.logger.warn(
        `Extraction de métadonnées ${format} échouée (ignorée) : ${(error as Error).message}`,
      );
      return EMPTY_METADATA;
    }
  }

  /** Lit le dictionnaire Info du PDF (Title/Author/Subject/CreationDate). */
  private async extractFromPdf(buffer: Buffer): Promise<ExtractedFileMetadata> {
    const doc = await PDFDocument.load(buffer, { updateMetadata: false });
    return {
      title: nonEmpty(doc.getTitle()),
      author: nonEmpty(doc.getAuthor()),
      language: null, // le dictionnaire Info ne porte pas de langue standard
      publisher: nonEmpty(doc.getProducer()),
      publishYear: yearFrom(doc.getCreationDate()?.toISOString()),
      cover: null, // pas de couverture embarquée standard en PDF
    };
  }

  /**
   * Lit les métadonnées Dublin Core du fichier OPF (META-INF/container.xml
   * → rootfile → <metadata> dc:title/dc:creator/dc:language/dc:publisher/
   * dc:date) et la couverture référencée dans le <manifest>.
   */
  private extractFromEpub(buffer: Buffer): ExtractedFileMetadata {
    const zip = new AdmZip(buffer);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      // ⚠ Même raison que pour le SRU et le client OAI : un `&#233;` non décodé
      // entrerait dans le titre d'une notice depuis l'OPF d'un EPUB.
      htmlEntities: true,
    });

    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) return EMPTY_METADATA;
    const container = parser.parse(containerEntry.getData().toString('utf-8'));
    const rootfile = container?.container?.rootfiles?.rootfile;
    const opfPath: string | undefined = Array.isArray(rootfile)
      ? rootfile[0]?.['@_full-path']
      : rootfile?.['@_full-path'];
    if (!opfPath) return EMPTY_METADATA;

    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) return EMPTY_METADATA;
    const opf = parser.parse(opfEntry.getData().toString('utf-8'));
    const metadata = opf?.package?.metadata ?? {};

    const firstOf = (value: unknown): string | undefined =>
      Array.isArray(value) ? value[0] : (value as string | undefined);

    const opfDir = opfPath.includes('/')
      ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
      : '';
    const cover = this.extractEpubCover(zip, opf, opfDir);

    return {
      title: nonEmpty(firstOf(metadata['dc:title'])),
      author: nonEmpty(firstOf(metadata['dc:creator'])),
      language: nonEmpty(firstOf(metadata['dc:language'])),
      publisher: nonEmpty(firstOf(metadata['dc:publisher'])),
      publishYear: yearFrom(firstOf(metadata['dc:date'])),
      cover,
    };
  }

  /**
   * Couverture EPUB3 (<item properties="cover-image">) ou repli EPUB2
   * (<meta name="cover" content="ID_MANIFEST">).
   */
  private extractEpubCover(
    zip: AdmZip,
    opf: any,
    opfDir: string,
  ): { buffer: Buffer; mimeType: string } | null {
    const items = opf?.package?.manifest?.item;
    const manifestItems: any[] = Array.isArray(items) ? items : items ? [items] : [];

    let coverItem = manifestItems.find((item) =>
      String(item['@_properties'] ?? '').includes('cover-image'),
    );

    if (!coverItem) {
      const metas = opf?.package?.metadata?.meta;
      const metaList: any[] = Array.isArray(metas) ? metas : metas ? [metas] : [];
      const coverMeta = metaList.find((m) => m['@_name'] === 'cover');
      const coverId = coverMeta?.['@_content'];
      if (coverId) {
        coverItem = manifestItems.find((item) => item['@_id'] === coverId);
      }
    }

    const href: string | undefined = coverItem?.['@_href'];
    if (!href) return null;

    const entry = zip.getEntry(opfDir + href);
    if (!entry) return null;

    const extension = href.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = COVER_MIME_BY_EXTENSION[extension];
    if (!mimeType) return null;

    return { buffer: entry.getData(), mimeType };
  }
}
