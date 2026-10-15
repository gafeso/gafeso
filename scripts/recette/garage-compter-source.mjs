#!/usr/bin/env node
// Compte les objets restes dans le MinIO SOURCE : c'est lui, le retour arriere.
import { clientS3, listerLesObjets } from '../lib/objets-s3.mjs';
const c = clientS3(process.env.MINIO_SOURCE_URL, process.env.MINIO_SOURCE_KEY, process.env.MINIO_SOURCE_SECRET);
let n = 0;
for (const b of ['digital-copies', 'covers']) { try { n += (await listerLesObjets(c, b)).length; } catch {} }
console.log(n);
