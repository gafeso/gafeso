/**
 * E2E HTTP du cœur offline — SANS MOCK, contre le vrai tenant_zinda + MinIO.
 *
 * Gaté par OFFLINE_E2E=1 (comme la parité recherche) : exige l'infra dev up
 * (Postgres 5433, MinIO 9000) + les clés offline dans .env. La suite unitaire
 * normale ne le lance pas.
 *
 *   OFFLINE_E2E=1 npx dotenv -e ../../.env -- npx vitest run offline-licensing.e2e
 *
 * L'app Nest est bootée dans un PROCESS ENFANT (harness) car NestFactory plante
 * dans le module-runner de vitest ; la spec la teste en vraie HTTP via fetch.
 *
 * Flux prouvé : POST /offline/devices (vraie clé EC P-256) → POST /offline/licenses
 * avec X-Tenant (middleware réel + getRecordAccessStatus réel) → vérif signature
 * Ed25519 → déballage CEK EC-KEM par la clé privée de l'appareil → téléchargement du
 * blob (MinIO) → déchiffrement COMPLET jusqu'à %PDF → révocation (droit retiré
 * en base → status passe `revoked`).
 */
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import {
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  verify as cryptoVerify,
} from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import jwt from 'jsonwebtoken';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CONTENT_ALGO,
  DEFAULT_SEG_SIZE,
  decryptSegment,
  encryptSegmented,
  generateCek,
  wrapCekWithKek,
} from './content-crypto';
import { ensureValidPdfXref } from './pdf-xref';
import { canonicalize } from './license-crypto';

const RUN = process.env.OFFLINE_E2E === '1';
const ENC_BUCKET = 'digital-copies';

/** Lance le harness Nest en enfant, résout le port quand il est prêt. */
function startHarness(): Promise<{ proc: ChildProcess; port: number }> {
  const harness = path.resolve(
    process.cwd(),
    'src/offline-licensing/offline-licensing.e2e.harness.ts',
  );
  const proc = spawn(
    'npx',
    ['ts-node', '--transpile-only', '--compiler-options', '{"module":"commonjs"}', harness],
    { cwd: process.cwd(), env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('harness timeout')), 55_000);
    let err = '';
    proc.stdout!.on('data', (d: Buffer) => {
      const m = /E2E_LISTENING (\d+)/.exec(d.toString());
      if (m) {
        clearTimeout(timer);
        resolve({ proc, port: Number(m[1]) });
      }
    });
    proc.stderr!.on('data', (d: Buffer) => {
      err += d.toString();
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`harness a quitté (code ${code}) : ${err.slice(0, 500)}`));
    });
  });
}

describe.runIf(RUN)('offline-licensing e2e (tenant_zinda réel, sans mock)', () => {
  let harness: ChildProcess;
  let base: string;
  let pub: PrismaClient;
  let zdb: PrismaClient;
  let s3: S3Client;
  let studentToken: string;

  const fx: {
    tenantId?: string;
    recordId?: string;
    collectionId?: string;
    accessRuleId?: string;
    collectionTitleId?: string;
    deviceId?: string;
    encObjectKey?: string;
  } = {};

  // Appareil = clé EC P-256 (EC-KEM). La publique voyage en SPKI DER base64.
  const device = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const devicePubB64 = (
    device.publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  ).toString('base64');

  const headers = () => ({
    Authorization: `Bearer ${studentToken}`,
    'X-Tenant': 'zinda',
    'Content-Type': 'application/json',
  });

  beforeAll(async () => {
    const started = await startHarness();
    harness = started.proc;
    base = `http://127.0.0.1:${started.port}`;

    const dbUrl = process.env.DATABASE_URL as string;
    pub = new PrismaClient();
    zdb = new PrismaClient({
      datasources: { db: { url: dbUrl.replace('schema=public', 'schema=tenant_zinda') } },
    });

    const tenant = await pub.tenant.findUnique({ where: { slug: 'zinda' } });
    fx.tenantId = tenant!.id;

    // Étudiant réel (L1_DROIT, ACTIVE) — jeton signé avec le vrai JWT_SECRET.
    const student = await zdb.user.findFirst({ where: { email: 'awa@exemple.bf' } });
    studentToken = jwt.sign(
      { sub: student!.id, email: student!.email, role: 'STUDENT', tenant: 'zinda' },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' },
    );

    s3 = new S3Client({
      endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER as string,
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD as string,
      },
      forcePathStyle: true,
    });

    // Document de test dans tenant_zinda.
    const record = await zdb.biblioRecord.create({
      data: { marcData: {}, marcFormat: 'UNIMARC', recordType: 'Thèse', title: 'E2E OFFLINE TEST' },
    });
    fx.recordId = record.id;

    // PDF réel (pdf-lib → xref valide garanti).
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([300, 300]).drawText('E2E offline — document de test', { x: 20, y: 150, size: 12 });
    const pdf = Buffer.from(await pdfDoc.save());

    await zdb.digitalCopy.create({
      data: {
        recordId: record.id,
        objectKey: `e2e/${record.id}/clear.pdf`,
        fileFormat: 'PDF',
        fileSizeBytes: pdf.length,
        originalName: 'e2e.pdf',
      },
    });

    // Ingestion (mêmes primitives que ContentIngestionService : xref valide +
    // AEAD 16 Ko + CEK enveloppée par la KEK serveur). Dépôt du blob dans MinIO.
    const kek = Buffer.from(process.env.OFFLINE_CONTENT_KEK as string, 'base64');
    const linearized = await ensureValidPdfXref(pdf);
    const cek = generateCek();
    const blob = encryptSegmented(linearized, cek, DEFAULT_SEG_SIZE);
    const encWrappedCek = wrapCekWithKek(cek, kek);
    cek.fill(0);
    const encObjectKey = `${record.id}/enc/${Date.now()}.gafs`;
    fx.encObjectKey = encObjectKey;
    await s3.send(
      new PutObjectCommand({ Bucket: ENC_BUCKET, Key: encObjectKey, Body: blob }),
    );
    await zdb.digitalCopy.update({
      where: { recordId: record.id },
      data: {
        encObjectKey,
        encWrappedCek,
        encSegSize: DEFAULT_SEG_SIZE,
        encAlgo: CONTENT_ALGO,
        encStatus: 'ready',
        xrefValidatedAt: new Date(),
        encryptedAt: new Date(),
      },
    });

    // Droit d'accès (public) : collection INTERNAL + règle L1_DROIT + lien notice.
    const collection = await pub.collection.create({
      data: { name: 'E2E OFFLINE', type: 'INTERNAL', tenantId: tenant!.id },
    });
    fx.collectionId = collection.id;
    const rule = await pub.accessRule.create({
      data: { collectionId: collection.id, tenantId: tenant!.id, className: 'L1_DROIT' },
    });
    fx.accessRuleId = rule.id;
    const link = await pub.collectionTitle.create({
      data: { collectionId: collection.id, recordId: record.id },
    });
    fx.collectionTitleId = link.id;
  }, 90_000);

  afterAll(async () => {
    try { if (fx.recordId) await zdb.offlineLicense.deleteMany({ where: { recordId: fx.recordId } }); } catch { /* */ }
    try { if (fx.deviceId) await zdb.device.deleteMany({ where: { id: fx.deviceId } }); } catch { /* */ }
    try { if (fx.recordId) await zdb.digitalCopy.deleteMany({ where: { recordId: fx.recordId } }); } catch { /* */ }
    try { if (fx.recordId) await zdb.biblioRecord.delete({ where: { id: fx.recordId } }); } catch { /* */ }
    try { if (fx.collectionTitleId) await pub.collectionTitle.delete({ where: { id: fx.collectionTitleId } }); } catch { /* */ }
    try { if (fx.accessRuleId) await pub.accessRule.delete({ where: { id: fx.accessRuleId } }); } catch { /* */ }
    try { if (fx.collectionId) await pub.collection.delete({ where: { id: fx.collectionId } }); } catch { /* */ }
    try { if (fx.encObjectKey) await s3.send(new DeleteObjectCommand({ Bucket: ENC_BUCKET, Key: fx.encObjectKey })); } catch { /* */ }
    await pub?.$disconnect().catch(() => undefined);
    await zdb?.$disconnect().catch(() => undefined);
    harness?.kill('SIGTERM');
  }, 30_000);

  it('device → licence → vérif Ed25519 → CEK → blob → %PDF → révocation', async () => {
    // 1) Enregistrement de l'appareil (vraie clé publique EC P-256).
    const devRes = await fetch(`${base}/offline/devices`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ publicKey: devicePubB64, label: 'e2e', platform: 'android' }),
    });
    expect(devRes.status).toBe(201);
    const dev = await devRes.json();
    fx.deviceId = dev.id;
    expect(dev.id).toBeTruthy();

    // 2) Émission de la licence (middleware X-Tenant + droit réels).
    const licRes = await fetch(`${base}/offline/licenses`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ docId: fx.recordId, deviceId: dev.id }),
    });
    expect(licRes.status).toBe(201);
    const lic = await licRes.json();

    // Licence LIÉE à {user, device, tenant, expires}.
    expect(lic.body.tenant).toBe('zinda');
    expect(lic.body.deviceId).toBe(dev.id);
    expect(lic.body.docId).toBe(fx.recordId);
    expect(new Date(lic.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // 3) Vérif signature Ed25519 avec la clé publique renvoyée.
    const sigOk = cryptoVerify(
      null,
      Buffer.from(canonicalize(lic.body), 'utf8'),
      createPublicKey(lic.licensePublicKey),
      Buffer.from(lic.signature, 'base64'),
    );
    expect(sigOk).toBe(true);

    // 4) Déballage de la CEK par la clé PRIVÉE de l'appareil (EC-KEM).
    // EC-KEM : ECDH(device_priv, epk) + HKDF-SHA256 + AES-256-GCM (AAD = deviceId).
    // Miroir exact du DeviceKeystore mobile — zéro SHA-1.
    const w = JSON.parse(lic.wrappedCek) as { v: number; epk: string; nonce: string; ct: string };
    expect(w.v).toBe(1);
    const z = diffieHellman({
      privateKey: device.privateKey,
      publicKey: createPublicKey({ key: Buffer.from(w.epk, 'base64'), format: 'der', type: 'spki' }),
    });
    const kekWrap = Buffer.from(
      hkdfSync('sha256', z, Buffer.alloc(0), Buffer.from('gafeso/cek-wrap/v1', 'utf8'), 32),
    );
    const rawCt = Buffer.from(w.ct, 'base64');
    const dec = createDecipheriv('aes-256-gcm', kekWrap, Buffer.from(w.nonce, 'base64'));
    dec.setAAD(Buffer.from(dev.id, 'utf8'));
    dec.setAuthTag(rawCt.subarray(rawCt.length - 16));
    const cek = Buffer.concat([dec.update(rawCt.subarray(0, rawCt.length - 16)), dec.final()]);
    expect(cek.length).toBe(32);

    // 5) Téléchargement du blob chiffré depuis MinIO — illisible au repos.
    const obj = await s3.send(new GetObjectCommand({ Bucket: ENC_BUCKET, Key: lic.encObjectKey }));
    const blob = Buffer.from(await obj.Body!.transformToByteArray());
    expect(blob.subarray(0, 5).toString('latin1')).toBe('GAFS1');

    // 6) Déchiffrement COMPLET segment par segment → doit ressortir %PDF.
    const headerLen = blob.readUInt32LE(6);
    const header = JSON.parse(blob.subarray(10, 10 + headerLen).toString('utf8')) as { n_segs: number };
    const parts: Buffer[] = [];
    for (let i = 0; i < header.n_segs; i++) parts.push(decryptSegment(blob, i, cek));
    expect(Buffer.concat(parts).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // 7) Statut initial = active.
    const st1 = await fetch(`${base}/offline/licenses/${lic.licenseId}/status`, { headers: headers() });
    expect((await st1.json()).status).toBe('active');

    // 8) RÉVOCATION par retrait du droit en base : l'étudiant perd l'accès →
    //    le re-check en ligne fait passer la licence à `revoked`.
    await pub.accessRule.delete({ where: { id: fx.accessRuleId! } });
    fx.accessRuleId = undefined;
    const st2 = await fetch(`${base}/offline/licenses/${lic.licenseId}/status`, { headers: headers() });
    expect((await st2.json()).status).toBe('revoked');
  }, 60_000);
});
