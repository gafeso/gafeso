#!/usr/bin/env node
/**
 * AUTO-CONTRÔLE DE LECTURE — la moitié qui tourne DANS le conteneur.
 *
 * ## Pourquoi il existe, et ce que son absence a coûté
 *
 * La bascule MinIO → Garage du 21 octobre 2026 a été déclarée réussie.
 * Pendant DOUZE JOURS la démonstration n'a servi AUCUN document, et tous les
 * contrôles étaient verts : `health`, `totalHits` et « copies numériques »
 * interrogent tous LA BASE. **La chaîne complète n'avait jamais été éprouvée
 * par personne.**
 *
 * ## ⚠ CE QU'IL NE FAIT PAS, ET C'EST DÉLIBÉRÉ
 *
 * Il ne LIT PAS l'objet lui-même. Un `fetch` depuis CE conteneur n'emprunte
 * pas le chemin du navigateur : l'URL publique repasserait par le DNS public
 * et le NAT en épingle, quand il fonctionne — et surtout, il ne prouverait
 * rien de l'en-tête CORS si Caddy était contourné. **La lecture est donc
 * faite par l'HÔTE**, qui est dehors, par `scripts/autocontrole-lecture.sh`.
 *
 * Ce script-ci fait les deux gestes que seul le conteneur peut faire :
 * DÉPOSER un objet d'essai et le SUPPRIMER — avec la MÊME fonction de
 * signature que le produit (`StorageService.getSignedDownloadUrl`), jamais
 * une URL fabriquée à côté.
 *
 * ## ⚠ IL N'ÉCRIT RIEN DANS LE CATALOGUE
 *
 * Ni notice, ni compte, ni copie numérique en base. Un objet nu dans le
 * bucket `digital-copies`, préfixé `_autocontrole/`, et retiré ensuite. Un
 * auto-contrôle qui laisse une notice d'essai dans le fonds d'un client est
 * un auto-contrôle qu'on finit par ne plus lancer.
 *
 *   node scripts/autocontrole-lecture.mjs --deposer    → JSON sur stdout
 *   node scripts/autocontrole-lecture.mjs --supprimer <cle>
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = 'digital-copies';
const PREFIXE = '_autocontrole/';

function requis(nom) {
  const v = process.env[nom];
  if (!v) {
    console.error(`AUTOCONTROLE_ERREUR variable ${nom} absente`);
    process.exit(2);
  }
  return v;
}

function client() {
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const scheme = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  return new S3Client({
    endpoint: `${scheme}://${endpoint}:${port}`,
    region: 'us-east-1',
    credentials: {
      accessKeyId: requis('MINIO_ROOT_USER'),
      secretAccessKey: requis('MINIO_ROOT_PASSWORD'),
    },
    forcePathStyle: true,
  });
}

/**
 * ⚠ LA RÉÉCRITURE VERS L'HÔTE PUBLIC EST CELLE DU PRODUIT, pas une variante.
 * `MINIO_PUBLIC_URL` est ce que le navigateur reçoit ; signer avec l'endpoint
 * interne puis réécrire schéma/hôte/port est exactement ce que fait
 * `StorageService.rewriteToPublicOrigin` — et c'est ce qui rend ce contrôle
 * représentatif. En diverger produirait une URL que le produit n'émet jamais.
 */
function versHotePublic(signee, basePublique) {
  const u = new URL(signee);
  const pub = new URL(basePublique);
  u.protocol = pub.protocol;
  u.hostname = pub.hostname;
  u.port = pub.port;
  return u.toString();
}

const mode = process.argv[2];
const s3 = client();

if (mode === '--deposer') {
  // Un contenu ALÉATOIRE : son empreinte prouve que ce sont bien CES octets
  // qui sont revenus, pas une page d'erreur de la bonne taille.
  const octets = randomBytes(4096);
  const sha = createHash('sha256').update(octets).digest('hex');
  const cle = `${PREFIXE}${Date.now()}-${randomBytes(8).toString('hex')}.bin`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: cle,
      Body: octets,
      ContentType: 'application/pdf',
    }),
  );
  const basePublique =
    process.env.MINIO_PUBLIC_URL ??
    `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${
      process.env.MINIO_ENDPOINT ?? 'localhost'
    }:${process.env.MINIO_PORT ?? '9000'}`;
  const signee = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: cle,
      ResponseContentDisposition: 'inline; filename="autocontrole.pdf"',
    }),
    { expiresIn: 300 },
  );
  console.log(
    JSON.stringify({ cle, sha256: sha, octets: octets.length, url: versHotePublic(signee, basePublique) }),
  );
} else if (mode === '--supprimer') {
  const cle = process.argv[3];
  if (!cle || !cle.startsWith(PREFIXE)) {
    // ⚠ Un auto-contrôle qui accepterait une clé arbitraire deviendrait un
    // outil de suppression. Il ne retire QUE ce qu'il a lui-même déposé.
    console.error(`AUTOCONTROLE_ERREUR clé hors du préfixe ${PREFIXE} : refus de supprimer`);
    process.exit(2);
  }
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: cle }));
  console.log('supprime');
} else {
  console.error('usage : --deposer | --supprimer <cle>');
  process.exit(2);
}
