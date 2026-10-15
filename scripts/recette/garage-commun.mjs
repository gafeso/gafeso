/**
 * Ce fichier ne porte plus que les reexports dont les sondes ont besoin :
 * les aides de comparaison vivent dans scripts/lib/objets-s3.mjs, partagees
 * avec la MIGRATION. Une verification en double finirait par diverger.
 */
import { clientS3, sha256, corpsDeLObjet, listerLesObjets } from '../lib/objets-s3.mjs';
import { CreateBucketCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const client = clientS3;
export const sha = sha256;
export const corps = corpsDeLObjet;
export const lister = listerLesObjets;
export { CreateBucketCommand, GetObjectCommand, PutObjectCommand, getSignedUrl };
