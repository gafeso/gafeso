/**
 * Aides S3 partagees : lister, lire, sommer.
 *
 * ⚠ UNE SEULE IMPLEMENTATION, et c'est le sujet : la recette Garage et la
 * MIGRATION comparent les memes objets. Deux implementations d'une meme
 * verification finissent par differer, et c'est le jour de la bascule qu'on
 * s'en apercevrait.
 */
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

export const clientS3 = (endpoint, cle, secret) => new S3Client({
  endpoint, region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: cle, secretAccessKey: secret },
});

export const sha256 = (b) => createHash('sha256').update(b).digest('hex');

export async function corpsDeLObjet(c, Bucket, Key) {
  const r = await c.send(new GetObjectCommand({ Bucket, Key }));
  return Buffer.from(await r.Body.transformToByteArray());
}

/** Tous les objets d'un bucket, PAGINE jusqu'au bout et trie par cle. */
export async function listerLesObjets(c, Bucket) {
  const out = [];
  let jeton;
  do {
    const r = await c.send(new ListObjectsV2Command({ Bucket, ContinuationToken: jeton }));
    for (const o of r.Contents ?? []) out.push({ Key: o.Key, Size: o.Size });
    jeton = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (jeton);
  return out.sort((a, b) => a.Key.localeCompare(b.Key));
}
