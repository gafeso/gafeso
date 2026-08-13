/**
 * Fixtures pour l'e2e MOBILE (Étape 2) — piloté par le test Dart de `gafeso-mobile`.
 *
 * Sous-commandes :
 *   create            → provisionne un document offline-ready dans tenant_zinda + le droit
 *                       d'accès, et imprime un JSON { tenant, token, docId, ids… } ;
 *   create-big <blob> <cekHex>
 *                     → même chose, mais réutilise un blob GAFS1 DÉJÀ chiffré (le vrai scan
 *                       lourd du fonds) : évite de re-chiffrer des centaines de Mo, et c'est
 *                       exactement le contenu que le lecteur devra tenir en mémoire ;
 *   revoke <ruleId>   → supprime la règle d'accès (l'usager perd le droit → status revoked) ;
 *   cleanup <json>    → supprime tout ce que `create` a posé.
 *
 * Volontairement hors du dossier src (pas ramassé par la suite de tests). Utilise la même
 * crypto de contenu que l'ingestion réelle (AEAD 16 Ko + xref valide + CEK enveloppée KEK).
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import jwt from 'jsonwebtoken';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  CONTENT_ALGO,
  DEFAULT_SEG_SIZE,
  encryptSegmented,
  generateCek,
  wrapCekWithKek,
} from '../src/offline-licensing/content-crypto';
import { ensureValidPdfXref } from '../src/offline-licensing/pdf-xref';

const ENC_BUCKET = 'digital-copies';
const TITLE = 'E2E MOBILE ÉTAPE 2';
const TITLE_BIG = 'MESURE PLANCHER — THESE 446 Mo';

function s3(): S3Client {
  return new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER as string,
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD as string,
    },
    forcePathStyle: true,
  });
}

function clients() {
  const url = process.env.DATABASE_URL as string;
  return {
    pub: new PrismaClient(),
    zdb: new PrismaClient({
      datasources: { db: { url: url.replace('schema=public', 'schema=tenant_zinda') } },
    }),
  };
}

async function create() {
  const { pub, zdb } = clients();
  const tenant = await pub.tenant.findUnique({ where: { slug: 'zinda' } });
  if (!tenant) throw new Error('tenant zinda absent');

  const student = await zdb.user.findFirst({ where: { email: 'awa@exemple.bf' } });
  if (!student) throw new Error('étudiante awa@exemple.bf absente');
  const token = jwt.sign(
    { sub: student.id, email: student.email, role: 'STUDENT', tenant: 'zinda' },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' },
  );

  // Document multi-pages (exerce la pagination du lecteur).
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) {
    const p = doc.addPage([420, 595]);
    p.drawText('Gafeso — e2e mobile étape 2', { x: 40, y: 520, size: 18, font });
    p.drawText(`Page ${i} / 5`, { x: 40, y: 480, size: 12, font });
  }
  const pdf = Buffer.from(await doc.save());

  const record = await zdb.biblioRecord.create({
    data: { marcData: {}, marcFormat: 'UNIMARC', recordType: 'Thèse', title: TITLE },
  });

  const kek = Buffer.from(process.env.OFFLINE_CONTENT_KEK as string, 'base64');
  const linearized = await ensureValidPdfXref(pdf);
  const cek = generateCek();
  const blob = encryptSegmented(linearized, cek, DEFAULT_SEG_SIZE);
  const encWrappedCek = wrapCekWithKek(cek, kek);
  cek.fill(0);
  const encObjectKey = `${record.id}/enc/${Date.now()}.gafs`;
  await s3().send(new PutObjectCommand({ Bucket: ENC_BUCKET, Key: encObjectKey, Body: blob }));

  await zdb.digitalCopy.create({
    data: {
      recordId: record.id,
      objectKey: `e2e-mobile/${record.id}/clear.pdf`,
      fileFormat: 'PDF',
      fileSizeBytes: pdf.length,
      originalName: 'e2e-mobile.pdf',
      encObjectKey,
      encWrappedCek,
      encSegSize: DEFAULT_SEG_SIZE,
      encAlgo: CONTENT_ALGO,
      encStatus: 'ready',
      xrefValidatedAt: new Date(),
      encryptedAt: new Date(),
    },
  });

  const collection = await pub.collection.create({
    data: { name: TITLE, type: 'INTERNAL', tenantId: tenant.id },
  });
  const rule = await pub.accessRule.create({
    data: { collectionId: collection.id, tenantId: tenant.id, className: 'L1_DROIT' },
  });
  const link = await pub.collectionTitle.create({
    data: { collectionId: collection.id, recordId: record.id },
  });

  console.log(
    JSON.stringify({
      tenant: 'zinda',
      token,
      userId: student.id,
      docId: record.id,
      recordId: record.id,
      collectionId: collection.id,
      accessRuleId: rule.id,
      collectionTitleId: link.id,
      encObjectKey,
      clearSize: linearized.length,
    }),
  );
  await pub.$disconnect();
  await zdb.$disconnect();
}

/**
 * Variante « gros document » : enregistre un blob GAFS1 EXISTANT (déjà produit par la crypto
 * de contenu) au lieu d'en fabriquer un. La CEK est fournie en hexa et enveloppée par la KEK
 * serveur, comme le ferait l'ingestion. Sert à mesurer la mémoire sur le vrai pire-cas du fonds.
 */
async function createBig(blobPath: string, cekHex: string) {
  const { pub, zdb } = clients();
  const tenant = await pub.tenant.findUnique({ where: { slug: 'zinda' } });
  if (!tenant) throw new Error('tenant zinda absent');
  const student = await zdb.user.findFirst({ where: { email: 'awa@exemple.bf' } });
  if (!student) throw new Error('étudiante awa@exemple.bf absente');
  const token = jwt.sign(
    { sub: student.id, email: student.email, role: 'STUDENT', tenant: 'zinda' },
    process.env.JWT_SECRET as string,
    { expiresIn: '2h' },
  );

  const blob = readFileSync(blobPath);
  if (blob.subarray(0, 5).toString('latin1') !== 'GAFS1') {
    throw new Error('le fichier fourni n’est pas un blob GAFS1');
  }
  const header = JSON.parse(
    blob.subarray(10, 10 + blob.readUInt32LE(6)).toString('utf8'),
  ) as { file_len: number; seg_size: number; n_segs: number };

  const record = await zdb.biblioRecord.create({
    data: { marcData: {}, marcFormat: 'UNIMARC', recordType: 'Thèse', title: TITLE_BIG },
  });

  const kek = Buffer.from(process.env.OFFLINE_CONTENT_KEK as string, 'base64');
  const encWrappedCek = wrapCekWithKek(Buffer.from(cekHex, 'hex'), kek);
  const encObjectKey = `${record.id}/enc/${Date.now()}.gafs`;
  await s3().send(new PutObjectCommand({ Bucket: ENC_BUCKET, Key: encObjectKey, Body: blob }));

  await zdb.digitalCopy.create({
    data: {
      recordId: record.id,
      objectKey: `e2e-mobile/${record.id}/clear.pdf`,
      fileFormat: 'PDF',
      fileSizeBytes: header.file_len,
      originalName: 'these-lourde.pdf',
      encObjectKey,
      encWrappedCek,
      encSegSize: header.seg_size,
      encAlgo: CONTENT_ALGO,
      encStatus: 'ready',
      xrefValidatedAt: new Date(),
      encryptedAt: new Date(),
    },
  });

  const collection = await pub.collection.create({
    data: { name: TITLE_BIG, type: 'INTERNAL', tenantId: tenant.id },
  });
  const rule = await pub.accessRule.create({
    data: { collectionId: collection.id, tenantId: tenant.id, className: 'L1_DROIT' },
  });
  const link = await pub.collectionTitle.create({
    data: { collectionId: collection.id, recordId: record.id },
  });

  console.log(
    JSON.stringify({
      tenant: 'zinda',
      token,
      userId: student.id,
      docId: record.id,
      recordId: record.id,
      collectionId: collection.id,
      accessRuleId: rule.id,
      collectionTitleId: link.id,
      encObjectKey,
      clearSize: header.file_len,
      segSize: header.seg_size,
      nSegs: header.n_segs,
      blobSize: blob.length,
    }),
  );
  await pub.$disconnect();
  await zdb.$disconnect();
}

async function revoke(ruleId: string) {
  const { pub } = clients();
  await pub.accessRule.delete({ where: { id: ruleId } }).catch(() => undefined);
  console.log(JSON.stringify({ revoked: true }));
  await pub.$disconnect();
}

async function cleanup(raw: string) {
  const fx = JSON.parse(raw) as Record<string, string>;
  const { pub, zdb } = clients();
  const t = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* nettoyage tolérant */
    }
  };
  await t(() => zdb.offlineLicense.deleteMany({ where: { recordId: fx.recordId } }));
  await t(() => zdb.device.deleteMany({ where: { userId: fx.userId } }));
  await t(() => zdb.digitalCopy.deleteMany({ where: { recordId: fx.recordId } }));
  await t(() => zdb.biblioRecord.delete({ where: { id: fx.recordId } }));
  await t(() => pub.collectionTitle.delete({ where: { id: fx.collectionTitleId } }));
  await t(() => pub.accessRule.delete({ where: { id: fx.accessRuleId } }));
  await t(() => pub.collection.delete({ where: { id: fx.collectionId } }));
  await t(() =>
    s3().send(new DeleteObjectCommand({ Bucket: ENC_BUCKET, Key: fx.encObjectKey })),
  );
  console.log(JSON.stringify({ cleaned: true }));
  await pub.$disconnect();
  await zdb.$disconnect();
}

const [cmd, arg, arg2] = process.argv.slice(2);
const run =
  cmd === 'create'
    ? create()
    : cmd === 'create-big'
      ? createBig(arg, arg2)
      : cmd === 'revoke'
        ? revoke(arg)
        : cmd === 'cleanup'
          ? cleanup(arg)
          : null;
if (!run) {
  console.error(
    'usage: mobile-e2e-fixture.ts create | create-big <blob.gafs> <cekHex> | revoke <ruleId> | cleanup <json>',
  );
  process.exit(2);
}
run.catch((e) => {
  console.error(e);
  process.exit(1);
});
