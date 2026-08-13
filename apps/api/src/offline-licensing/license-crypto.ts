import {
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  createCipheriv,
  randomBytes,
  KeyObject,
  sign,
} from 'crypto';

/**
 * Crypto de LICENCE (asymétrique) :
 *  - `signLicense` : signe le corps canonique de licence en Ed25519 avec la clé
 *    privée serveur ; l'app mobile vérifie avec la clé publique embarquée.
 *  - `wrapCekForDevice` : enveloppe la CEK pour l'appareil en **EC-KEM** (P-256 +
 *    HKDF-SHA256 + AES-256-GCM). Seul cet appareil (clé privée EC non-exportable
 *    dans l'Android Keystore, PURPOSE_AGREE_KEY) peut la déballer → le blob est
 *    illisible ailleurs. **Aucun SHA-1 nulle part.**
 *
 * Corps de licence = objet JSON lié : { v, docId, tenant, userId, deviceId,
 * issuedAt, expiresAt, rights }. Sérialisation CANONIQUE (clés triées) pour que
 * serveur et app signent/vérifient exactement les mêmes octets.
 */

/** Version du format de licence. v1 = EC-KEM (remplace le key-wrap RSA-OAEP). */
export const LICENSE_VERSION = 1;

export interface LicenseBody {
  v: number; // version de format (1 = EC-KEM)
  docId: string;
  tenant: string;
  userId: string;
  deviceId: string;
  issuedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  rights: Record<string, unknown>;
}

/** JSON canonique : clés triées récursivement, séparateurs stables. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

/** Signature Ed25519 (base64) du corps canonique. */
export function signLicense(body: LicenseBody, privateKey: KeyObject): string {
  const message = Buffer.from(canonicalize(body), 'utf8');
  // Pour Ed25519, l'algorithme de hachage est null (signature sur le message brut).
  return sign(null, message, privateKey).toString('base64');
}

/** Version du format d'enveloppe de CEK. v1 = EC-KEM (P-256 + HKDF-SHA256 + AES-256-GCM). */
export const CEK_WRAP_VERSION = 1;

/** Paramètres HKDF — doivent être IDENTIQUES AU BIT PRÈS côté mobile (point de couture). */
const HKDF_INFO = 'gafeso/cek-wrap/v1';
const HKDF_SALT = Buffer.alloc(0); // salt vide, versionné par `info`
const KEK_LEN = 32; // AES-256
const GCM_NONCE_LEN = 12;

/** Enveloppe EC-KEM sérialisée, transportée dans la licence (champ `wrappedCek`). */
export interface WrappedCek {
  v: number;
  epk: string; // clé publique éphémère, SPKI DER base64
  nonce: string; // base64 (12 o)
  ct: string; // base64, tag GCM inclus en fin
}

/**
 * Enveloppe la CEK pour l'appareil en **EC-KEM (style ECIES), sans aucun SHA-1** :
 *   1. paire EC P-256 éphémère ;
 *   2. `Z = ECDH(éphémère_priv, device_pub)` ;
 *   3. `KEK = HKDF-SHA256(ikm=Z, salt="", info="gafeso/cek-wrap/v1", L=32)` ;
 *   4. `ct||tag = AES-256-GCM(KEK, nonce aléatoire, CEK)`, **AAD = deviceId** (lie l'enveloppe
 *      à l'appareil : une enveloppe rejouée pour un autre `deviceId` échoue à l'authentification) ;
 *   5. sortie `{v, epk, nonce, ct}`.
 *
 * Remplace RSA-OAEP : sur le plancher (API 33) le keystore verrouille le MGF1 de RSA-OAEP sur
 * SHA-1 (`setMgf1Digests` = API 34), donc l'EC est le seul chemin totalement sans-SHA-1.
 * La clé privée de l'appareil reste non-exportable dans le keystore (PURPOSE_AGREE_KEY).
 */
export function wrapCekForDevice(
  cek: Buffer,
  devicePublicKeySpkiB64: string,
  deviceId: string,
): string {
  const devicePub = createPublicKey({
    key: Buffer.from(devicePublicKeySpkiB64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  if (devicePub.asymmetricKeyType !== 'ec') {
    throw new Error('Clé d’appareil invalide : EC P-256 attendu (EC-KEM).');
  }

  const eph = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const z = diffieHellman({ privateKey: eph.privateKey, publicKey: devicePub });
  const kek = Buffer.from(hkdfSync('sha256', z, HKDF_SALT, Buffer.from(HKDF_INFO, 'utf8'), KEK_LEN));
  z.fill(0);

  try {
    const nonce = randomBytes(GCM_NONCE_LEN);
    const cipher = createCipheriv('aes-256-gcm', kek, nonce);
    cipher.setAAD(Buffer.from(deviceId, 'utf8'));
    const ct = Buffer.concat([cipher.update(cek), cipher.final(), cipher.getAuthTag()]);
    const wrapped: WrappedCek = {
      v: CEK_WRAP_VERSION,
      epk: (eph.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64'),
      nonce: nonce.toString('base64'),
      ct: ct.toString('base64'),
    };
    return JSON.stringify(wrapped);
  } finally {
    kek.fill(0);
  }
}
