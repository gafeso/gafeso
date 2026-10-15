import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const DIGITAL_COPIES_BUCKET = 'digital-copies';
/**
 * Nom PAR DÉFAUT du bucket public des couvertures.
 *
 * ⚠ CE N'EST PLUS UNE CONSTANTE DU PRODUIT, et c'est Garage qui l'impose : son
 * point d'entrée web choisit le bucket par le NOM D'HÔTE, donc le bucket public
 * porte le DOMAINE des couvertures pour nom. Mesuré en montant la pile de
 * production : avec « covers » câblé en dur, l'API créait un bucket parasite et
 * ne trouvait pas celui que l'initialisation avait posé.
 *
 * `STORAGE_PUBLIC_BUCKET` le remplace ; le défaut reste « covers », donc une
 * installation MinIO existante ne change pas de comportement.
 */
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
/**
 * Adresse publique d'une couverture — DEUX FORMES, et c'est le STOCKAGE qui
 * décide, jamais l'appelant.
 *
 * · `bucketDansLeChemin = true` → `<base>/covers/<clé>`. La forme de MinIO, où
 *   un bucket public se lit sous son nom dans le chemin. C'est le DÉFAUT, et la
 *   production n'en change pas.
 * · `false` → `<base>/<clé>`. La forme de Garage, dont le point d'entrée web
 *   choisit le bucket par le NOM D'HÔTE : le domaine des couvertures — que
 *   DEPLOY.md exige déjà — porte le nom du bucket, et le chemin ne doit PAS le
 *   répéter.
 *
 * ⚠ MESURÉ sur une pile Garage jetable, pas supposé : avec l'alias global
 * `couvertures.exemple.test` posé sur le bucket, une requête ANONYME portant
 * cet hôte et un chemin SANS le bucket rend HTTP 200 ; un hôte INCONNU rend
 * 404 — ce qui prouve que le choix se fait par l'hôte, et non par hasard.
 *
 * ⚠ Elle est PURE et exportée, comme ses deux voisines de ce fichier : une
 * méthode privée se serait éprouvée en relâchant sa visibilité ou par
 * `Object.create`, ce qui mesure l'instrument plutôt que la règle.
 */
export function urlPubliqueDeCouverture(
  publicBaseUrl: string,
  bucket: string,
  key: string,
  bucketDansLeChemin: boolean,
): string {
  return bucketDansLeChemin ? `${publicBaseUrl}/${bucket}/${key}` : `${publicBaseUrl}/${key}`;
}

/**
 * ⚠ SEUL « false » BASCULE. Une lecture qui accepterait n'importe quelle valeur
 * non vide ferait qu'une faute de frappe dans l'environnement change l'adresse
 * de TOUTES les couvertures — sans rien casser, donc sans que personne le voie.
 */
export function bucketPublicDansLeChemin(valeur: string | undefined): boolean {
  return (valeur ?? 'true') !== 'false';
}

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
  /** Nom RÉEL du bucket public — voir COVERS_BUCKET pour le motif. */
  private readonly bucketPublic: string;

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
    this.bucketPublic = this.config.get<string>('STORAGE_PUBLIC_BUCKET') ?? COVERS_BUCKET;
  }

  /** Crée les buckets nécessaires s'ils n'existent pas déjà. */
  async onModuleInit(): Promise<void> {
    await this.ensureBucket(DIGITAL_COPIES_BUCKET);
    await this.ensureBucket(this.bucketPublic, { publicRead: true });
  }

  private async ensureBucket(
    bucket: string,
    options: { publicRead?: boolean } = {},
  ): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch {
      // le bucket n'existe pas, ou la clé n'y a pas droit — on tente de le créer
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      this.logger.log(`Bucket "${bucket}" créé.`);
      if (options.publicRead) {
        await this.client.send(
          new PutBucketPolicyCommand({ Bucket: bucket, Policy: publicReadPolicy(bucket) }),
        );
      }
    } catch (cause) {
      // ⚠ UN REFUS QUI DIT QUOI FAIRE, plutôt qu'une pile d'appels du SDK.
      //
      // Mesuré en montant la pile de production sur Garage : l'API sortait sur
      // « AccessDenied /digital-copies/ » et vingt lignes de `middleware-sdk-s3`,
      // ce qui n'accuse rien. La cause était que le service d'initialisation
      // n'avait pas tourné — et Garage ne permet PAS à une clé ordinaire de
      // créer un bucket, ni de poser une politique (`PutBucketPolicy` :
      // NotImplemented, mesuré).
      const quoi = (cause as { Code?: string })?.Code ?? (cause as Error)?.name ?? 'inconnu';
      throw new Error(
        `Le bucket « ${bucket} » est introuvable et n'a pas pu être créé (${quoi}).\n` +
          "Sur Garage, les buckets ne sont PAS créés par l'API : c'est le service " +
          "d'initialisation qui les pose, et l'API doit démarrer APRÈS lui.\n" +
          '· vérifiez que `garage-init` a terminé sans erreur ;\n' +
          '· vérifiez que STORAGE_PUBLIC_BUCKET vaut bien le DOMAINE des ' +
          "couvertures (le point d'entrée web de Garage choisit le bucket par " +
          "le nom d'hôte).",
      );
    }
  }

  /**
   * Combien d'objets le bucket des copies numériques porte-t-il ?
   *
   * ⚠ `null` quand le bucket est ABSENT ou illisible — et c'est une
   * information, pas un échec : la décision de cohérence traite l'absence et
   * le vide PAREIL, parce que les deux veulent dire « l'application ne
   * trouvera aucun document ».
   *
   * ⚠ Et on ne demande qu'UNE clé (`MaxKeys: 1`) : il s'agit de savoir s'il y
   * a quelque chose, pas combien. Un comptage complet au démarrage lirait un
   * fonds entier pour répondre à une question binaire.
   */
  async compterLesCopiesNumeriques(): Promise<number | null> {
    try {
      const r = await this.client.send(
        new ListObjectsV2Command({ Bucket: DIGITAL_COPIES_BUCKET, MaxKeys: 1 }),
      );
      return r.KeyCount ?? (r.Contents?.length ?? 0);
    } catch {
      return null;
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
        Bucket: this.bucketPublic,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return urlPubliqueDeCouverture(
      this.publicBaseUrl,
      this.bucketPublic,
      key,
      bucketPublicDansLeChemin(this.config.get<string>('STORAGE_PUBLIC_BUCKET_IN_PATH')),
    );
  }
}
