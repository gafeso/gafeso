import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import {
  CONTENT_ALGO,
  DEFAULT_SEG_SIZE,
  encryptSegmented,
  generateCek,
  wrapCekWithKek,
} from './content-crypto';
import { OfflineKeysService } from './offline-keys.service';
import { ensureValidPdfXref } from './pdf-xref';

/** Métadonnées de chiffrement à persister sur DigitalCopy après une ingestion réussie. */
export interface IngestionResult {
  encObjectKey: string;
  encWrappedCek: string;
  encSegSize: number;
  encAlgo: string;
  xrefValidatedAt: Date;
  encryptedAt: Date;
}

/**
 * Ingestion offline d'un PDF : (1) garantit un xref valide (erreur explicite si
 * irréparable), (2) chiffre en blob AEAD segmenté sous une CEK propre au
 * document, (3) dépose le blob dans MinIO, (4) renvoie la CEK ENVELOPPÉE par la
 * KEK serveur (jamais en clair). Le fichier CLAIR d'origine n'est pas touché
 * (lecture en ligne conservée).
 */
@Injectable()
export class ContentIngestionService {
  private readonly logger = new Logger(ContentIngestionService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly keys: OfflineKeysService,
  ) {}

  async ingestPdf(recordId: string, clearBuffer: Buffer): Promise<IngestionResult> {
    // 1) xref valide — lève une erreur EXPLICITE si le PDF est irréparable.
    const linearized = await ensureValidPdfXref(clearBuffer);
    const xrefValidatedAt = new Date();

    // 2) CEK propre au document → blob AEAD segmenté (16 Ko).
    const cek = generateCek();
    try {
      const blob = encryptSegmented(linearized, cek, DEFAULT_SEG_SIZE);

      // 3) dépôt du blob chiffré (à côté du clair).
      const encObjectKey = `${recordId}/enc/${Date.now()}.gafs`;
      await this.storage.putObject(encObjectKey, blob, 'application/octet-stream');

      // 4) CEK enveloppée par la KEK serveur — jamais en clair au repos.
      const encWrappedCek = wrapCekWithKek(cek, this.keys.contentKek);

      return {
        encObjectKey,
        encWrappedCek,
        encSegSize: DEFAULT_SEG_SIZE,
        encAlgo: CONTENT_ALGO,
        xrefValidatedAt,
        encryptedAt: new Date(),
      };
    } finally {
      cek.fill(0); // efface la CEK de la mémoire quoi qu'il arrive
    }
  }
}
