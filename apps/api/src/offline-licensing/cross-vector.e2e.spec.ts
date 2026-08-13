/**
 * Vecteur croisé TS→Kotlin (gaté OFFLINE_E2E=1). Un blob AEAD segmenté produit
 * par le module TS (content-crypto) est déchiffré par le VRAI SegmentedBlobReader
 * du lecteur mobile (Spike-B, non modifié) compilé sur JVM → doit ressortir un
 * PDF. Preuve d'interop de FORMAT avant que le mobile ne dépende du serveur.
 *
 * La CEK est ici la clé codée en dur du reader de spike (le format, pas la clé,
 * est ce qu'on prouve). Toolchain Kotlin/JVM + dépôt mobile requis (chemins par
 * défaut sous ~/mobiletools et ~/spike-gafeso, surchargeables) : à défaut, le
 * test est ignoré proprement.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptSegmented } from './content-crypto';
import { ensureValidPdfXref } from './pdf-xref';

const JDK = process.env.JDK_HOME ?? path.join(process.env.HOME ?? '', 'mobiletools/jdk');
const KOTLIN_LIB =
  process.env.KOTLIN_LIB ?? path.join(process.env.HOME ?? '', 'mobiletools/gradle-8.9/lib');
const SPIKE_READER =
  process.env.SPIKE_READER ??
  path.join(
    process.env.HOME ?? '',
    'spike-gafeso/android-b1/app/src/main/java/com/gafeso/spikeb/SegmentedBlobReader.kt',
  );
const XV_DIR = path.resolve(process.cwd(), 'test/cross-vector');
const JAVA = path.join(JDK, 'bin/java');

// Même clé que le SegmentedBlobReader de spike (codée en dur) : on prouve le
// FORMAT, pas la distribution de clé.
const SPIKE_KEY = Buffer.from(
  '00112233445566778899aabbccddeeff' + 'ffeeddccbbaa99887766554433221100',
  'hex',
);

const toolchainReady =
  process.env.OFFLINE_E2E === '1' &&
  existsSync(JAVA) &&
  existsSync(KOTLIN_LIB) &&
  existsSync(SPIKE_READER);

function stdlibJar(): string {
  const j = readdirSync(KOTLIN_LIB).find((f) => /^kotlin-stdlib-.*\.jar$/.test(f));
  if (!j) throw new Error('kotlin-stdlib introuvable dans KOTLIN_LIB');
  return path.join(KOTLIN_LIB, j);
}

describe.runIf(toolchainReady)('vecteur croisé TS→Kotlin (interop de format)', () => {
  const blobPath = path.join(tmpdir(), `xvec-${Date.now()}.gafs`);
  const jar = path.join(XV_DIR, 'build/xvec.jar');
  const jsonJar = path.join(XV_DIR, 'build/json.jar');

  beforeAll(async () => {
    // 1) Compiler le harnais (vrai reader mobile + CrossVector.kt) → jar.
    const build = spawnSync('bash', [path.join(XV_DIR, 'build.sh')], {
      encoding: 'utf8',
      env: { ...process.env, JDK_HOME: JDK, KOTLIN_LIB, SPIKE_READER },
    });
    if (build.status !== 0) {
      throw new Error(`build.sh a échoué : ${build.stderr || build.stdout}`);
    }

    // 2) Chiffrer un PDF côté TS avec la clé du reader de spike.
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]).drawText('cross-vector TS->Kotlin', { x: 20, y: 150, size: 12 });
    const pdf = Buffer.from(await doc.save());
    const blob = encryptSegmented(await ensureValidPdfXref(pdf), SPIKE_KEY, 16 * 1024);
    writeFileSync(blobPath, blob);
  }, 120_000);

  afterAll(() => {
    try { require('node:fs').unlinkSync(blobPath); } catch { /* */ }
  });

  it('le déchiffreur Kotlin du mobile ressort %PDF depuis un blob chiffré par le module TS', () => {
    const cp = [jar, stdlibJar(), jsonJar].join(':');
    const run = spawnSync(JAVA, ['-cp', cp, 'com.gafeso.spikeb.CrossVectorKt', blobPath], {
      encoding: 'utf8',
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('XVEC_OK head=%PDF-');
  }, 30_000);
});
