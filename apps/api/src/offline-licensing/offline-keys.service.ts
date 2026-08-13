import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPrivateKey,
  createPublicKey,
  KeyObject,
} from 'crypto';

/**
 * Chargement et validation des CLÉS SERVEUR du cœur offline. Trois clés
 * (documentées dans docs/architecture-securite-offline.md, §3 contenu
 * chiffré, §4 liaison à l'appareil, §6 licence) :
 *
 *  1. **KEK de contenu** (`OFFLINE_CONTENT_KEK`, 32 o base64) — symétrique,
 *     serveur seul. Enveloppe les CEK au repos (AES-256-GCM). Jamais hors serveur.
 *  2. **Clé de signature de licence Ed25519** (`OFFLINE_LICENSE_PRIVATE_KEY`,
 *     PEM PKCS8) — le serveur SIGNE la licence avec la privée ; l'app VÉRIFIE
 *     avec la publique embarquée. Asymétrique (le JWT HS256 ne se vérifie pas
 *     hors ligne).
 *  3. (par document) la **CEK** — générée à l'ingestion, jamais ici.
 *
 * REFUS DE DÉMARRER si une clé est absente/malformée (même exigence que
 * JWT_SECRET). Les secrets vivent hors dépôt (.env non commité).
 */
@Injectable()
export class OfflineKeysService {
  private readonly logger = new Logger(OfflineKeysService.name);
  readonly contentKek: Buffer;
  readonly licensePrivateKey: KeyObject;
  readonly licensePublicKeyPem: string;

  constructor(config: ConfigService) {
    const kekB64 = config.get<string>('OFFLINE_CONTENT_KEK');
    if (!kekB64) {
      throw new Error(
        'OFFLINE_CONTENT_KEK manquant : le cœur offline ne peut pas démarrer (générer 32 o, base64, hors dépôt).',
      );
    }
    this.contentKek = Buffer.from(kekB64, 'base64');
    if (this.contentKek.length !== 32) {
      throw new Error('OFFLINE_CONTENT_KEK invalide : 32 octets attendus (clé AES-256, base64).');
    }

    const skPem = config.get<string>('OFFLINE_LICENSE_PRIVATE_KEY');
    if (!skPem) {
      throw new Error(
        'OFFLINE_LICENSE_PRIVATE_KEY manquant : clé de signature Ed25519 (PEM PKCS8) requise, hors dépôt.',
      );
    }
    try {
      this.licensePrivateKey = createPrivateKey(skPem.replace(/\\n/g, '\n'));
      if (this.licensePrivateKey.asymmetricKeyType !== 'ed25519') {
        throw new Error(`type ${this.licensePrivateKey.asymmetricKeyType}, ed25519 attendu`);
      }
      this.licensePublicKeyPem = createPublicKey(this.licensePrivateKey)
        .export({ type: 'spki', format: 'pem' })
        .toString();
    } catch (error) {
      throw new Error(
        `OFFLINE_LICENSE_PRIVATE_KEY invalide (Ed25519 PEM PKCS8 attendu) : ${(error as Error).message}`,
      );
    }
    this.logger.log('Clés offline chargées (KEK de contenu + signature de licence Ed25519).');
  }
}
