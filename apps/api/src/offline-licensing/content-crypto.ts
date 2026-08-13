import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Crypto de contenu — AEAD segmenté (AES-256-GCM) + enveloppe de CEK par la KEK
 * serveur. Le format du blob est IDENTIQUE à celui que consomme le lecteur natif
 * (Kotlin `SegmentedBlobReader` du spike) : le backend chiffre, le mobile
 * déchiffre segment par segment via PDFium `FPDF_LoadCustomDocument`.
 *
 *   Blob = MAGIC("GAFS1\0") | u32LE headerLen | headerJSON | N*[nonce(12)|ct|tag(16)]
 *   headerJSON = { file_len, seg_size, n_segs }
 *   AAD par segment = <QQQ> little-endian (index, seg_size, file_len)
 *
 * La CEK (clé de contenu, 32 o) est propre à chaque document. Elle n'est JAMAIS
 * stockée en clair : `wrapCekWithKek` la chiffre sous la KEK serveur au repos.
 */
const MAGIC_SEG = Buffer.from([0x47, 0x41, 0x46, 0x53, 0x31, 0x00]); // "GAFS1\0"
const NONCE = 12;
const TAG = 16;
export const DEFAULT_SEG_SIZE = 16 * 1024;
export const CONTENT_ALGO = 'aead-seg-gcm-16k/v1';

export function generateCek(): Buffer {
  return randomBytes(32);
}

function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/** AAD d'un segment : (index, seg_size, file_len) en trois u64 little-endian. */
function segAad(index: number, segSize: number, fileLen: number): Buffer {
  const b = Buffer.alloc(24);
  b.writeBigUInt64LE(BigInt(index), 0);
  b.writeBigUInt64LE(BigInt(segSize), 8);
  b.writeBigUInt64LE(BigInt(fileLen), 16);
  return b;
}

/** Chiffre `plaintext` en blob AEAD segmenté sous la CEK. */
export function encryptSegmented(
  plaintext: Buffer,
  cek: Buffer,
  segSize: number = DEFAULT_SEG_SIZE,
): Buffer {
  const fileLen = plaintext.length;
  const nSegs = Math.ceil(fileLen / segSize);
  const header = Buffer.from(
    JSON.stringify({ file_len: fileLen, seg_size: segSize, n_segs: nSegs }),
    'utf8',
  );
  const parts: Buffer[] = [MAGIC_SEG, u32le(header.length), header];
  for (let k = 0; k < nSegs; k++) {
    const chunk = plaintext.subarray(k * segSize, Math.min((k + 1) * segSize, fileLen));
    const nonce = randomBytes(NONCE);
    const cipher = createCipheriv('aes-256-gcm', cek, nonce);
    cipher.setAAD(segAad(k, segSize, fileLen));
    const ct = Buffer.concat([cipher.update(chunk), cipher.final()]);
    parts.push(nonce, ct, cipher.getAuthTag());
  }
  return Buffer.concat(parts);
}

/**
 * Déchiffre le segment `index` d'un blob (utilisé par les tests / vérifications).
 * Le clair complet n'est JAMAIS reconstitué côté serveur en production.
 */
export function decryptSegment(blob: Buffer, index: number, cek: Buffer): Buffer {
  const headerLen = blob.readUInt32LE(6);
  const header = JSON.parse(blob.subarray(10, 10 + headerLen).toString('utf8')) as {
    file_len: number;
    seg_size: number;
    n_segs: number;
  };
  const bodyOff = 10 + headerLen;
  const encSeg = NONCE + header.seg_size + TAG;
  const ptLen = Math.min(header.seg_size, header.file_len - index * header.seg_size);
  const start = bodyOff + index * encSeg;
  const nonce = blob.subarray(start, start + NONCE);
  const ct = blob.subarray(start + NONCE, start + NONCE + ptLen);
  const tag = blob.subarray(start + NONCE + ptLen, start + NONCE + ptLen + TAG);
  const decipher = createDecipheriv('aes-256-gcm', cek, nonce);
  decipher.setAAD(segAad(index, header.seg_size, header.file_len));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Enveloppe la CEK sous la KEK serveur (AES-256-GCM) → base64(nonce|ct|tag). */
export function wrapCekWithKek(cek: Buffer, kek: Buffer): string {
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv('aes-256-gcm', kek, nonce);
  const ct = Buffer.concat([cipher.update(cek), cipher.final()]);
  return Buffer.concat([nonce, ct, cipher.getAuthTag()]).toString('base64');
}

/** Récupère la CEK depuis son enveloppe KEK (inverse de wrapCekWithKek). */
export function unwrapCekWithKek(wrapped: string, kek: Buffer): Buffer {
  const raw = Buffer.from(wrapped, 'base64');
  const nonce = raw.subarray(0, NONCE);
  const ct = raw.subarray(NONCE, raw.length - TAG);
  const tag = raw.subarray(raw.length - TAG);
  const decipher = createDecipheriv('aes-256-gcm', kek, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
