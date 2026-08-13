import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BiblioRecord, DigitalFormat, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { buildRecordSearchDoc, SearchService } from '../search/search.service';
import { ContentIngestionService } from '../offline-licensing/content-ingestion.service';
import { computeMetadataPatch, MetadataExtractionService } from './metadata-extraction.service';

const EMPTY_EXTRACTED_METADATA = {
  title: null,
  author: null,
  language: null,
  publisher: null,
  publishYear: null,
  cover: null,
} as const;

export type TenantDb = PrismaClient;

/** Types MIME acceptés → format interne. */
const ACCEPTED_MIME: Record<string, DigitalFormat> = {
  'application/pdf': DigitalFormat.PDF,
  'application/epub+zip': DigitalFormat.EPUB,
};

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 Mo

/**
 * Signature de début de fichier (« nombre magique ») attendue par format.
 *
 * Le type MIME d'un téléversement vient de l'en-tête MULTIPART, donc du client :
 * il se déclare, il ne se prouve pas. Un fichier texte annoncé
 * `application/pdf` était accepté (vérifié : HTTP 201), stocké, puis échouait
 * silencieusement à l'ingestion hors-ligne — le document n'était JAMAIS
 * disponible hors ligne et rien ne le disait.
 *
 * On vérifie donc les octets. EPUB étant un ZIP, sa signature est celle d'une
 * archive : cela n'écarte pas un ZIP qui ne serait pas un EPUB, mais élimine
 * le cas courant du fichier mal étiqueté par le poste du bibliothécaire.
 */
const MAGIC_BYTES: Record<DigitalFormat, { bytes: Buffer; label: string }> = {
  [DigitalFormat.PDF]: { bytes: Buffer.from('%PDF-'), label: 'PDF' },
  [DigitalFormat.EPUB]: { bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]), label: 'EPUB (archive ZIP)' },
};

/** Le contenu correspond-il vraiment au format annoncé ? */
export function contentMatchesFormat(buffer: Buffer, format: DigitalFormat): boolean {
  const magic = MAGIC_BYTES[format];
  if (!magic) return false;
  return buffer.subarray(0, magic.bytes.length).equals(magic.bytes);
}

export interface UploadedDigitalFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class DigitalCopyService {
  private readonly logger = new Logger(DigitalCopyService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly metadataExtraction: MetadataExtractionService,
    private readonly search: SearchService,
    private readonly ingestion: ContentIngestionService,
    // Les collections et règles d'accès vivent dans `public` (clés par
    // tenantId), pas dans le schéma de l'école : il faut le client partagé.
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Rattache la notice à la collection SOCLE de l'école, si elle existe.
   *
   * C'est ce qui fait qu'un document tout juste téléversé est LISIBLE
   * immédiatement. Auparavant, il fallait créer une collection, y ajouter le
   * document à la main, puis écrire une règle d'accès — sur un fonds réel,
   * document par document.
   *
   * Best-effort et idempotent : l'unicité (collectionId, recordId) absorbe un
   * ré-upload, et toute erreur est journalisée sans jamais faire échouer
   * l'upload lui-même. Si l'administrateur a supprimé la collection par
   * défaut, on ne la recrée pas : c'est un choix explicite de sa part.
   */
  private async attachToDefaultCollection(slug: string, recordId: string) {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!tenant) return;
      const collection = await this.prisma.collection.findFirst({
        where: { tenantId: tenant.id, isDefault: true },
        select: { id: true, name: true },
      });
      if (!collection) return;

      const existing = await this.prisma.collectionTitle.findFirst({
        where: { collectionId: collection.id, recordId },
        select: { id: true },
      });
      if (existing) return;

      await this.prisma.collectionTitle.create({
        data: { collectionId: collection.id, recordId },
      });
      this.logger.log(
        `Document ${recordId} rattaché à « ${collection.name} » (collection par défaut de ${slug}).`,
      );
    } catch (error) {
      this.logger.warn(
        `Rattachement de ${recordId} à la collection par défaut impossible : ` +
          `${(error as Error).message}. Le fichier est bien enregistré ; ` +
          `rattachez-le manuellement pour le rendre accessible.`,
      );
    }
  }

  /**
   * Rattache un fichier numérique (PDF/EPUB) à une notice. Une notice n'a
   * qu'un seul exemplaire numérique : un nouvel upload remplace l'ancien
   * (fichier précédent supprimé du bucket).
   *
   * Extrait ensuite les métadonnées embarquées (best-effort — un échec
   * d'extraction ne fait jamais échouer l'upload) et pré-remplit les champs
   * vides de la notice (jamais d'écrasement d'une valeur déjà saisie par le
   * bibliothécaire — voir computeMetadataPatch). Réindexe la notice si des
   * champs recherchables ont changé.
   */
  async upload(db: TenantDb, slug: string, recordId: string, file: UploadedDigitalFile) {
    const record = await db.biblioRecord.findUnique({
      where: { id: recordId },
      include: { digitalCopy: true },
    });
    if (!record) throw new NotFoundException('Notice introuvable.');

    const format = ACCEPTED_MIME[file.mimetype];
    if (!format) {
      throw new BadRequestException(
        'Format non pris en charge : seuls les fichiers PDF et EPUB sont acceptés.',
      );
    }
    if (file.size === 0) {
      throw new BadRequestException('Fichier vide.');
    }
    // Le CONTENU doit correspondre au format annoncé, pas seulement l'en-tête.
    if (!contentMatchesFormat(file.buffer, format)) {
      throw new BadRequestException(
        `Ce fichier est annoncé comme ${MAGIC_BYTES[format].label} mais son contenu ne ` +
          `l'est pas (signature de début de fichier absente). Vérifiez qu'il n'est pas ` +
          `corrompu, ni renommé depuis un autre format.`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} Mo, 200 Mo maximum).`,
      );
    }

    const objectKey = `${recordId}/${Date.now()}-${sanitizeFileName(file.originalname)}`;
    await this.storage.putObject(objectKey, file.buffer, file.mimetype);

    // L'ancien objet n'est supprimé qu'APRÈS le succès du nouvel upload et de
    // l'écriture en base — jamais de fenêtre où la notice n'a plus de fichier.
    const previousKey = record.digitalCopy?.objectKey;

    const digitalCopy = await db.digitalCopy.upsert({
      where: { recordId },
      create: {
        recordId,
        objectKey,
        fileFormat: format,
        fileSizeBytes: file.size,
        originalName: file.originalname,
      },
      update: {
        objectKey,
        fileFormat: format,
        fileSizeBytes: file.size,
        originalName: file.originalname,
        uploadedAt: new Date(),
      },
    });

    if (previousKey) {
      await this.storage.deleteObject(previousKey).catch(() => undefined);
    }

    // Rend le document accessible SANS aucune manipulation supplémentaire.
    await this.attachToDefaultCollection(slug, recordId);

    // Ingestion offline (PDF) : blob AEAD chiffré + xref valide, EN PARALLÈLE du
    // clair. Best-effort — un échec (ex. xref irréparable) est consigné sur
    // DigitalCopy (encStatus/encError) mais ne casse JAMAIS la lecture en ligne.
    if (format === DigitalFormat.PDF) {
      const previousEncKey = record.digitalCopy?.encObjectKey ?? null;
      try {
        const enc = await this.ingestion.ingestPdf(recordId, file.buffer);
        await db.digitalCopy.update({
          where: { recordId },
          data: { ...enc, encStatus: 'ready', encError: null },
        });
        if (previousEncKey) {
          await this.storage.deleteObject(previousEncKey).catch(() => undefined);
        }
      } catch (error) {
        await db.digitalCopy
          .update({
            where: { recordId },
            data: { encStatus: 'failed', encError: (error as Error).message },
          })
          .catch(() => undefined);
        this.logger.warn(
          `Ingestion offline échouée (notice ${recordId}, lecture en ligne conservée) : ${(error as Error).message}`,
        );
      }
    }

    // Défense en profondeur : MetadataExtractionService ne rejette normalement
    // jamais (il capture ses propres erreurs), mais l'upload du fichier ne
    // doit JAMAIS échouer à cause d'une étape annexe — même en cas de
    // comportement inattendu ici.
    const extractedMetadata = await this.metadataExtraction
      .extract(file.buffer, format)
      .catch((error: Error) => {
        this.logger.warn(`Extraction de métadonnées inattendue en échec : ${error.message}`);
        return EMPTY_EXTRACTED_METADATA;
      });
    const updatedRecord = await this.applyExtractedMetadata(
      db,
      slug,
      record,
      extractedMetadata,
    );

    return { digitalCopy, extractedMetadata, record: updatedRecord };
  }

  /**
   * Pré-remplit les champs vides de la notice à partir des métadonnées
   * extraites (et dépose la couverture embarquée si la notice n'en a pas
   * déjà une). Ne touche à rien si aucun champ n'est éligible.
   */
  private async applyExtractedMetadata(
    db: TenantDb,
    slug: string,
    record: BiblioRecord,
    extracted: Awaited<ReturnType<MetadataExtractionService['extract']>>,
  ): Promise<BiblioRecord> {
    const patch = computeMetadataPatch(record, extracted);

    let coverUrl: string | undefined;
    if (!record.coverUrl && extracted.cover) {
      try {
        const extension = extracted.cover.mimeType.split('/').pop();
        coverUrl = await this.storage.putCover(
          `${record.id}.${extension}`,
          extracted.cover.buffer,
          extracted.cover.mimeType,
        );
      } catch (error) {
        this.logger.warn(
          `Dépôt de la couverture extraite échoué (notice ${record.id}) : ${(error as Error).message}`,
        );
      }
    }

    if (Object.keys(patch).length === 0 && !coverUrl) {
      return record;
    }

    // Défense en profondeur : le fichier et l'exemplaire numérique sont déjà
    // enregistrés à ce stade (voir upload()) — un échec inattendu du
    // pré-remplissage (ex. valeur extraite toujours rejetée par PostgreSQL
    // malgré le nettoyage de MetadataExtractionService) ne doit JAMAIS faire
    // échouer l'upload. La notice reste alors inchangée ; le bibliothécaire
    // peut la corriger manuellement.
    try {
      const updated = await db.biblioRecord.update({
        where: { id: record.id },
        data: { ...patch, ...(coverUrl ? { coverUrl } : {}) },
        // Include complet : le document Meilisearch est REMPLACÉ en entier à
        // l'indexation — sans contributeurs/mots-clés ici, ils disparaîtraient
        // de la recherche à chaque upload de fichier.
        include: {
          contributors: { orderBy: { position: 'asc' } },
          keywords: { include: { keyword: true } },
        },
      });

      try {
        await this.search.indexRecords(slug, [buildRecordSearchDoc(updated)]);
      } catch (error) {
        this.logger.warn(
          `Réindexation après pré-remplissage échouée (notice ${updated.id}) : ${(error as Error).message}`,
        );
      }

      return updated;
    } catch (error) {
      this.logger.warn(
        `Pré-remplissage de la notice ${record.id} échoué (fichier conservé) : ${(error as Error).message}`,
      );
      return record;
    }
  }

  /** Métadonnées de l'exemplaire numérique d'une notice (sans le contenu). */
  async getMetadata(db: TenantDb, recordId: string) {
    const copy = await db.digitalCopy.findUnique({ where: { recordId } });
    if (!copy) {
      throw new NotFoundException('Aucun exemplaire numérique pour cette notice.');
    }
    return copy;
  }

  /**
   * URL signée temporaire pour lire/télécharger le fichier (15 min par défaut
   * — la lecture en ligne demande une durée plus longue, voir OpacController).
   * Cette méthode ne vérifie AUCUN droit d'accès elle-même : chaque appelant
   * applique le sien — téléchargement via la fonction document.telecharger
   * (cataloging.controller), lecture OPAC via access-control (brique 4).
   */
  async getDownloadUrl(db: TenantDb, recordId: string, ttlSeconds = 15 * 60) {
    const copy = await this.getMetadata(db, recordId);
    const url = await this.storage.getSignedDownloadUrl(
      copy.objectKey,
      copy.originalName,
      ttlSeconds,
    );
    return { url, expiresInSeconds: ttlSeconds, fileFormat: copy.fileFormat };
  }

  async remove(db: TenantDb, recordId: string) {
    const copy = await db.digitalCopy.findUnique({ where: { recordId } });
    if (!copy) throw new NotFoundException('Aucun exemplaire numérique pour cette notice.');
    await db.digitalCopy.delete({ where: { recordId } });
    await this.storage.deleteObject(copy.objectKey).catch(() => undefined);
    if (copy.encObjectKey) {
      await this.storage.deleteObject(copy.encObjectKey).catch(() => undefined);
    }
    return { deleted: true };
  }
}

/** Neutralise les caractères à risque dans un nom de fichier utilisateur. */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}
