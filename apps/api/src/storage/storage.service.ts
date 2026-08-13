import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const DIGITAL_COPIES_BUCKET = 'digital-copies';
export const COVERS_BUCKET = 'covers';
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * La signature S3 doit être calculée avec l'endpoint INTERNE (celui du
 * client MinIO, ex. http://minio:9000 en production — c'est l'hôte que la
 * requête signée porte dans X-Amz-SignedHeaders=host), mais l'URL renvoyée
 * au navigateur doit pointer vers l'hôte PUBLIC (MINIO_PUBLIC_URL, HTTPS) :
 * le nom du conteneur Docker n'est ni résolvable ni servi en HTTPS depuis
 * l'extérieur — sinon « Mixed Content » bloqué par le navigateur sur une
 * page HTTPS. On ne réécrit QUE le schéma/hôte/port ; le chemin et la query
 * string (dont la signature) restent inchangés.
 *
 * ⚠ La signature portant sur le Host, cette réécriture seule NE SUFFIT PAS :
 * si le navigateur envoie `Host: storage.bibliotheque.exemple.bf` jusqu'à MinIO, la
 * vérification échoue (SignatureDoesNotMatch) même avec une URL par
 * ailleurs correcte — testé en réel. Le Caddyfile (bloc STORAGE_DOMAIN)
 * force donc `header_up Host minio:9000` pour que MinIO revoie toujours le
 * Host qui a servi à signer, quel que soit le Host envoyé par le
 * navigateur — voir docker/Caddyfile.
 */
export function rewriteToPublicOrigin(signedUrl: string, publicBaseUrl: string): string {
  const url = new URL(signedUrl);
  const publicOrigin = new URL(publicBaseUrl);
  url.protocol = publicOrigin.protocol;
  url.hostname = publicOrigin.hostname;
  // Le setter `.host` ne réinitialise PAS le port existant quand la valeur
  // assignée n'en précise pas (constaté : minio:9000 → host="exemple.org"
  // laisse "exemple.org:9000" au lieu de "exemple.org") — `.port` séparé
  // est le seul moyen fiable de le vider (chaîne vide = port par défaut du
  // schéma) ou de le remplacer.
  url.port = publicOrigin.port;
  return url.toString();
}

/**
 * Défensif : `forcePathStyle` construit le chemin S3 comme `/<bucket>/<key>`.
 * Si la clé stockée en base porte déjà le nom du bucket en préfixe (ex.
 * "digital-copies/<uuid>/fichier.pdf" au lieu de "<uuid>/fichier.pdf" —
 * reproduit en production sur un fichier existant, cause exacte non
 * confirmée : import manuel, ancienne valeur, erreur de saisie), le chemin
 * final double le segment ("/digital-copies/digital-copies/...") et MinIO
 * répond 403 SignatureDoesNotMatch. On retire ce préfixe s'il est présent
 * plutôt que de faire confiance à la forme stockée.
 *
 * Vérifié séparément (voir storage.service.spec.ts) : ce n'est PAS
 * `rewriteToPublicOrigin` qui cause un doublon même si `MINIO_PUBLIC_URL`
 * contient elle-même un chemin (ex. ".../digital-copies" par erreur de
 * configuration) — elle ne réécrit que schéma/hôte/port, jamais le chemin.
 */
export function normalizeObjectKey(bucket: string, key: string): string {
  const prefix = `${bucket}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

/** Politique autorisant la lecture anonyme (les couvertures ne sont pas sensibles). */
function publicReadPolicy(bucket: string) {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

/**
 * Client de stockage objet (MinIO, S3-compatible). Deux buckets :
 *  - `digital-copies` (privé) : fichiers PDF/EPUB rattachés aux notices,
 *    accès uniquement via URL signée temporaire.
 *  - `covers` (lecture publique) : couvertures extraites des fichiers ou
 *    téléversées ; l'URL stockée dans BiblioRecord.coverUrl doit rester
 *    valide durablement, d'où un bucket à lecture anonyme plutôt que des
 *    URLs signées expirables.
 *
 * Phase 2 SANS DRM : les objets sont stockés tels quels ; la protection des
 * fichiers numériques tient à l'URL signée (pas de chiffrement Readium LCP —
 * ça, c'est Phase 3).
 */
/**
 * Lit une variable OBLIGATOIRE. Les identifiants de stockage n'ont pas de
 * défaut raisonnable : se rabattre sur une valeur inventée produit un échec
 * d'authentification difficile à relier à sa cause.
 */
function requireConfig(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) {
    throw new Error(
      `${key} manquant : le stockage objet ne peut pas s'authentifier. ` +
        `Renseignez-le dans .env (développement) ou .env.prod (production).`,
    );
  }
  return value;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    const port = this.config.get<string>('MINIO_PORT') ?? '9000';
    const useSsl = this.config.get<string>('MINIO_USE_SSL') === 'true';
    const scheme = useSsl ? 'https' : 'http';

    this.client = new S3Client({
      endpoint: `${scheme}://${endpoint}:${port}`,
      region: 'us-east-1', // ignoré par MinIO, requis par le SDK
      credentials: {
        // AUCUN repli codé en dur sur un identifiant : la valeur portait le
        // nom du produit (« bibliocloud »), donc une installation sans
        // MINIO_ROOT_USER s'authentifiait avec une clé arbitraire. Le stockage
        // échouait alors sur des erreurs d'authentification qui ressemblaient
        // à un bug applicatif. Mieux vaut un refus de démarrer explicite.
        accessKeyId: requireConfig(this.config, 'MINIO_ROOT_USER'),
        secretAccessKey: requireConfig(this.config, 'MINIO_ROOT_PASSWORD'),
      },
      forcePathStyle: true, // requis pour MinIO (pas de sous-domaines de bucket)
    });

    // En production, MINIO_PUBLIC_URL permet de pointer vers un domaine/CDN
    // public distinct de l'endpoint interne utilisé pour signer les requêtes.
    this.publicBaseUrl =
      this.config.get<string>('MINIO_PUBLIC_URL') ?? `${scheme}://${endpoint}:${port}`;
  }

  /** Crée les buckets nécessaires s'ils n'existent pas déjà. */
  async onModuleInit(): Promise<void> {
    await this.ensureBucket(DIGITAL_COPIES_BUCKET);
    await this.ensureBucket(COVERS_BUCKET, { publicRead: true });
  }

  private async ensureBucket(
    bucket: string,
    options: { publicRead?: boolean } = {},
  ): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      this.logger.log(`Bucket "${bucket}" créé.`);
      if (options.publicRead) {
        await this.client.send(
          new PutBucketPolicyCommand({ Bucket: bucket, Policy: publicReadPolicy(bucket) }),
        );
      }
    }
  }

  /** Dépose un fichier numérique (privé) sous la clé donnée. */
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: DIGITAL_COPIES_BUCKET,
        Key: normalizeObjectKey(DIGITAL_COPIES_BUCKET, key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Supprime un fichier numérique (ex. remplacement d'un exemplaire). */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: DIGITAL_COPIES_BUCKET,
        Key: normalizeObjectKey(DIGITAL_COPIES_BUCKET, key),
      }),
    );
  }

  /**
   * URL signée temporaire pour télécharger/streamer un fichier numérique.
   * 15 min par défaut (téléchargement admin) ; la lecture en ligne (OPAC)
   * demande une durée plus longue — le navigateur ne re-télécharge pas le
   * fichier une fois chargé, mais la session de lecture peut dépasser 15 min.
   */
  async getSignedDownloadUrl(
    key: string,
    downloadName: string,
    ttlSeconds: number = DOWNLOAD_URL_TTL_SECONDS,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: DIGITAL_COPIES_BUCKET,
      Key: normalizeObjectKey(DIGITAL_COPIES_BUCKET, key),
      ResponseContentDisposition: `inline; filename="${downloadName}"`,
    });
    const signedUrl = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
    return rewriteToPublicOrigin(signedUrl, this.publicBaseUrl);
  }

  /** Dépose une couverture (bucket à lecture publique) et renvoie son URL directe. */
  async putCover(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: COVERS_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.publicBaseUrl}/${COVERS_BUCKET}/${key}`;
  }
}
