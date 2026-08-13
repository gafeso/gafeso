import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptSegment,
  encryptSegmented,
  generateCek,
  unwrapCekWithKek,
  wrapCekWithKek,
} from './content-crypto';

describe('content-crypto — AEAD segmenté', () => {
  const cek = generateCek();

  it('blob : magic GAFS1, jamais %PDF ; roundtrip par segment (multi-segment)', () => {
    // 40 Ko de clair avec des segments de 16 Ko → 3 segments (dont un partiel).
    const plain = randomBytes(40 * 1024);
    const blob = encryptSegmented(plain, cek, 16 * 1024);

    expect(blob.subarray(0, 6)).toEqual(
      Buffer.from([0x47, 0x41, 0x46, 0x53, 0x31, 0x00]), // "GAFS1\0"
    );
    expect(blob.includes(Buffer.from('%PDF'))).toBe(false);

    const header = JSON.parse(
      blob.subarray(10, 10 + blob.readUInt32LE(6)).toString('utf8'),
    );
    expect(header).toMatchObject({ file_len: plain.length, seg_size: 16384, n_segs: 3 });

    const reassembled = Buffer.concat([
      decryptSegment(blob, 0, cek),
      decryptSegment(blob, 1, cek),
      decryptSegment(blob, 2, cek),
    ]);
    expect(reassembled.equals(plain)).toBe(true);
  });

  it('altération d’un octet d’un segment → échec d’authentification', () => {
    const blob = encryptSegmented(randomBytes(20 * 1024), cek, 16 * 1024);
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 20] ^= 0xff; // corrompt le dernier segment
    expect(() => decryptSegment(tampered, 1, cek)).toThrow();
  });

  it('CEK d’un autre document ne déchiffre pas', () => {
    const blob = encryptSegmented(randomBytes(1000), cek, 16 * 1024);
    expect(() => decryptSegment(blob, 0, generateCek())).toThrow();
  });

  it('enveloppe KEK : wrap/unwrap restitue la CEK ; jamais en clair', () => {
    const kek = randomBytes(32);
    const wrapped = wrapCekWithKek(cek, kek);
    expect(wrapped).not.toContain(cek.toString('base64'));
    expect(unwrapCekWithKek(wrapped, kek).equals(cek)).toBe(true);
  });

  it('mauvaise KEK ne déballe pas la CEK', () => {
    const wrapped = wrapCekWithKek(cek, randomBytes(32));
    expect(() => unwrapCekWithKek(wrapped, randomBytes(32))).toThrow();
  });
});
