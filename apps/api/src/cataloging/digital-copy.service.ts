import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BiblioRecord, DigitalFormat, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { buildRecordSearchDoc, SearchService } from '../search/search.service';
import { aplatirChampsDeProfil } from './champs-de-profil';
import { ContentIngestionService } from '../offline-licensing/content-ingestion.service';
import {
  contentMatchesFormat,
  verifierFichier,
  type UploadedDigitalFile,
} from './fichier-numerique';
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

// ⚠ Le vocabulaire du fichier numérique vit dans `fichier-numerique.ts` depuis
// le 12 septembre 2026 : le circuit de dépôt a besoin des MÊMES règles, et deux
// copies auraient donné deux jeux de seuils et deux formulations du refus.
// `contentMatchesFormat` et `UploadedDigitalFile` restent ré-exportés ici : des
// tests et des appelants les importent depuis ce module.
export { contentMatchesFormat, type UploadedDigitalFile };


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

      // ⚠ ON N'OUVRE PAS CE QUI EST DÉJÀ RÉSERVÉ — ajouté le 16 septembre 2026.
      //
      // Les règles d'accès sont un OU : la plus LARGE gagne. Rattacher au fonds
      // par défaut, ouvert à tous, une notice qui appartient déjà à une
      // collection réservée à une classe **annule cette réserve** — et la règle
      // restrictive reste AFFICHÉE, donc personne n'a de raison de la relire.
      // C'est « un élargissement qui laisse la restriction visible », et c'est
      // pire qu'un élargissement qui la supprime.
      //
      // Mesuré sur l'école de démonstration : 155 documents numériques sur 155
      // se retrouvaient dans le fonds ouvert, dont 28 aussi réservés à une
      // classe. AUCUNE restriction de classe n'avait d'effet sur la lecture —
      // sur le moment même que la démonstration présente comme la promesse
      // centrale du produit.
      //
      // ⚠ LE GESTE ÉPARGNE, IL NE DÉCIDE PAS. On ne retire rien, on n'écrase
      // rien : on s'abstient d'ajouter. Une bibliothécaire qui veut vraiment
      // ouvrir ce document le rattache elle-même au fonds général, et c'est
      // alors un second geste explicite — jamais un effet de bord du premier.
      const dejaReservee = await this.prisma.collectionTitle.findFirst({
        where: {
          recordId,
          collection: {
            tenantId: tenant.id,
            isDefault: false,
            // Une règle qui NOMME une classe ou un palier restreint ; une règle
            // sans les deux ouvre à tous et ne réserve donc rien.
            accessRules: {
              some: {
                tenantId: tenant.id,
                OR: [{ className: { not: null } }, { subscriptionTier: { not: null } }],
              },
            },
          },
        },
        select: { collection: { select: { name: true } } },
      });
      if (dejaReservee) {
        // ⚠ DIT, JAMAIS TU. Sans cette ligne, la bibliothécaire croirait son
        // document accessible à tous alors qu'il ne l'est pas — et le silence
        // serait de notre côté, pas du sien.
        this.logger.log(
          `Document ${recordId} NON rattaché au fonds par défaut de ${slug} : il appartient ` +
            `déjà à « ${dejaReservee.collection.name} », qui le réserve. L'ouvrir à tous ` +
            `annulerait cette réserve.`,
        );
        return;
      }

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

    const verdict = verifierFichier(file);
    if (!verdict.accepte) throw new BadRequestException(verdict.refus);
    const format = verdict.format;

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
        // Aplati : les champs de profil viennent de `profileData` (P3-3).
        await this.search.indexRecords(slug, [
          buildRecordSearchDoc(aplatirChampsDeProfil(updated)),
        ]);
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
