#!/usr/bin/env node
// Seme un fonds de depart realiste dans le MinIO SOURCE de la repetition.
import { PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { clientS3 } from '../lib/objets-s3.mjs';
const c = clientS3(process.env.SONDE_SOURCE, process.env.SONDE_SRC_CLE, process.env.SONDE_SRC_SECRET);
for (const b of ['digital-copies', 'covers']) { try { await c.send(new CreateBucketCommand({ Bucket: b })); } catch {} }
let n = 0;
for (let i = 0; i < 40; i += 1) {
  const o = Buffer.alloc(20_000 + ((i * 1171) % 64_000), 65 + (i % 26)); o.write('%PDF-1.4', 0);
  await c.send(new PutObjectCommand({ Bucket: 'digital-copies', Key: `theses/${String(i).padStart(3, '0')}.pdf`, Body: o }));
  n += 1;
}
for (let i = 0; i < 12; i += 1) {
  await c.send(new PutObjectCommand({ Bucket: 'covers', Key: `couv/${i}.jpg`, Body: Buffer.alloc(3_000 + i * 97, 100) }));
  n += 1;
}
console.log(n + ' objets');
