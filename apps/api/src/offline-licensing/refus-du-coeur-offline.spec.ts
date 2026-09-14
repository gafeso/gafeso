import { describe, expect, it, vi } from 'vitest';
import {
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  KeyObject,
  randomBytes,
  verify as cryptoVerify,
} from 'node:crypto';
import { OfflineLicensesService } from './offline-licenses.service';
import { OfflineKeysService } from './offline-keys.service';
import { canonicalize, signLicense, wrapCekForDevice } from './license-crypto';
import { wrapCekWithKek } from './content-crypto';

/**
 * ⚠ LES REFUS DU CŒUR OFFLINE — la moitié que l'e2e ne traverse pas.
 *
 * `offline-licensing.e2e.spec.ts` prouve le chemin qui RÉUSSIT : enrôlement,
 * émission, signature vérifiée, CEK déballée, blob déchiffré jusqu'à `%PDF`,
 * révocation. C'est beaucoup, et ce n'est qu'une moitié.
 *
 * Ce fichier tient l'autre : **ce qui doit être REFUSÉ**. C'est là que vit le
 * risque irrattrapable — une licence émise à tort part sur un téléphone avec le
 * blob ET la clé, pour toute la durée du bail, et elle ne se rappelle pas.
 *
 * ⚠ LE TROU QUE J'AI TROUVÉ EN LE CHERCHANT. `offline-licenses.service.spec.ts`
 * double `biblioRecord.findUnique` sur `{ embargoUntil: null }` — le cas SANS
 * embargo. Le cas AVEC, c'est-à-dire la propriété que le commentaire du service
 * défend en dix lignes, n'était éprouvé nulle part.
 *
 * ## Ce qui est doublé, et pourquoi
 *
 * Rien de cryptographique. Les doublures ne portent que ce qui n'entre pas dans
 * la décision : le journal d'audit, le stockage. `authz` est doublé pour dire
 * OUI — c'est ce qui rend le test fort : il prouve que l'embargo l'emporte même
 * sur quelqu'un qui a `document.lire`.
 */

/**
 * ⚠ LES CLÉS SONT FABRIQUÉES ICI, PAS LUES DANS `.env`.
 *
 * Ma première écriture construisait `OfflineKeysService(new ConfigService())` au
 * chargement du fichier : `npm test` levait « OFFLINE_CONTENT_KEK manquant » sur
 * toute machine sans `.env` chargé. Une heure après avoir écrit la leçon « un
 * test conditionnel s'éprouve dans ses DEUX états », j'ai refait la même faute
 * en un peu différent — un fichier qui exige une infrastructure pour être
 * seulement COLLECTÉ.
 *
 * ⚠ Et ce n'est pas qu'une commodité : ces refus doivent tourner dans la suite
 * ORDINAIRE. Une propriété de sécurité qu'on ne vérifie que derrière une porte
 * fermée est une propriété qu'on ne vérifie pas. Les clés sont donc engendrées,
 * comme le fait déjà `offline-licenses.service.spec.ts`.
 */
const KEK = randomBytes(32);
const ED = generateKeyPairSync('ed25519');
const CLES = {
  contentKek: KEK,
  licensePrivateKey: ED.privateKey,
  licensePublicKeyPem: ED.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
} as unknown as OfflineKeysService;

function service(db: unknown, aLaFonctionLire = true) {
  return new OfflineLicensesService(
    {
      forTenant: () => db,
      // Le TTL du bail vit dans `public.tenant_settings`, pas dans l'école.
      tenantSettings: { findUnique: vi.fn(async () => ({ offlineLicenseTtlDays: 14 })) },
    } as never,
    { hasFunction: vi.fn(async () => aLaFonctionLire) } as never,
    {
      buildStudentContext: vi.fn(async () => ({ userId: 'u1' })),
      getRecordAccessStatus: vi.fn(async () => ({ granted: true })),
    } as never,
    CLES,
    { log: vi.fn() } as never,
    { getSignedDownloadUrl: vi.fn(async () => 'https://exemple/blob') } as never,
  );
}

/** Une CEK réellement enveloppée par la KEK SERVEUR : le service la déballe. */
const CEK_ENVELOPPEE = wrapCekWithKek(Buffer.alloc(32, 7), CLES.contentKek);

const TENANT = { id: 't1', slug: 'zinda', name: 'Zinda' };
const USER = { sub: 'u1', email: 'a@exemple.bf', role: 'LIBRARIAN', tenant: 'zinda' } as never;

/** Une base doublée dont on choisit l'embargo et l'appareil. */
function base(options: { embargoUntil: Date | null; deviceUserId?: string; revoque?: boolean }) {
  return {
    device: {
      findUnique: vi.fn(async () => ({
        id: 'd1',
        userId: options.deviceUserId ?? 'u1',
        revokedAt: options.revoque ? new Date() : null,
        publicKey: DEVICE.spkiB64,
      })),
    },
    biblioRecord: {
      findUnique: vi.fn(async () => ({ embargoUntil: options.embargoUntil })),
    },
    digitalCopy: {
      findUnique: vi.fn(async () => ({
        recordId: 'rec-1',
        encObjectKey: 'k/enc.gafs',
        encWrappedCek: CEK_ENVELOPPEE,
        encSegSize: 16384,
        encAlgo: 'aead-seg-gcm-16k/v1',
        encStatus: 'ready',
      })),
      findFirst: vi.fn(async () => ({
        recordId: 'rec-1',
        encObjectKey: 'k/enc.gafs',
        encWrappedCek: CEK_ENVELOPPEE,
        encSegSize: 16384,
        encAlgo: 'aead-seg-gcm-16k/v1',
      })),
    },
    offlineLicense: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        id: 'lic-1',
        ...create,
      })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'lic-1', ...data })),
      findFirst: vi.fn(async () => null),
    },
  } as never;
}

/** Un appareil réel : clé EC P-256, comme le keystore mobile. */
const paire = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const DEVICE = {
  /** SPKI en base64 — la forme que `wrapCekForDevice` attend, et celle du mobile. */
  spkiB64: (paire.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64'),
  privee: paire.privateKey,
};

describe('⚠ L’EMBARGO REFUSE LA LICENCE — même à qui peut lire en ligne', () => {
  it('un document sous embargo ne sort PAS sur un appareil', async () => {
    // ⚠ C'est le cas irrattrapable : le téléphone garderait le blob ET la clé
    // pour toute la durée du bail, et une licence émise ne se rappelle pas.
    // Le service le défend en dix lignes de commentaire ; rien ne l'éprouvait.
    const demain = new Date(Date.now() + 24 * 3600_000);
    const svc = service(base({ embargoUntil: demain }), /* document.lire */ true);
    await expect(
      svc.issue(base({ embargoUntil: demain }), TENANT, USER, undefined, {
        docId: 'rec-1',
        deviceId: 'd1',
      } as never),
    ).rejects.toThrow();
  });

  it('⚠ TÉMOIN D’ABSENCE : le MÊME appel, embargo levé, passe', async () => {
    // Sans lui, un service qui refuse TOUT serait indiscernable d'un service
    // juste — et plus rassurant, puisqu'il ne laisserait jamais rien sortir.
    const db = base({ embargoUntil: null });
    const licence = await service(db).issue(db, TENANT, USER, undefined, {
      docId: 'rec-1',
      deviceId: 'd1',
    } as never);
    expect(licence).toBeTruthy();
  });

  it('un embargo ÉCHU ne refuse plus — la borne est stricte', async () => {
    const hier = new Date(Date.now() - 24 * 3600_000);
    const db = base({ embargoUntil: hier });
    await expect(
      service(db).issue(db, TENANT, USER, undefined, { docId: 'rec-1', deviceId: 'd1' } as never),
    ).resolves.toBeTruthy();
  });
});

describe('⚠ L’APPAREIL : le bail est lié, et le lien se vérifie', () => {
  it('l’appareil d’un AUTRE utilisateur est refusé', async () => {
    const db = base({ embargoUntil: null, deviceUserId: 'quelqu-un-dautre' });
    await expect(
      service(db).issue(db, TENANT, USER, undefined, { docId: 'rec-1', deviceId: 'd1' } as never),
    ).rejects.toThrow(/inconnu ou révoqué/i);
  });

  it('un appareil RÉVOQUÉ est refusé', async () => {
    const db = base({ embargoUntil: null, revoque: true });
    await expect(
      service(db).issue(db, TENANT, USER, undefined, { docId: 'rec-1', deviceId: 'd1' } as never),
    ).rejects.toThrow(/inconnu ou révoqué/i);
  });
});

describe('⚠ LA CRYPTOGRAPHIE REFUSE AUSSI — et c’est elle qui tient seule hors ligne', () => {
  /**
   * ⚠ Ces deux-là ne dépendent d'aucune base : ils éprouvent ce qui protège le
   * document UNE FOIS QU'IL EST SUR LE TÉLÉPHONE, là où aucun serveur ne peut
   * plus rien refuser.
   */
  const cek = Buffer.alloc(32, 7);

  /** Déballe une enveloppe EC-KEM — le miroir exact du keystore mobile. */
  function deballer(enveloppeJson: string, priveeAppareil: KeyObject, deviceId: string): Buffer {
    const w = JSON.parse(enveloppeJson) as { epk: string; nonce: string; ct: string };
    const epk = createPublicKey({
      key: Buffer.from(w.epk, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const z = diffieHellman({ privateKey: priveeAppareil, publicKey: epk });
    const kek = Buffer.from(
      hkdfSync('sha256', z, Buffer.alloc(0), Buffer.from('gafeso/cek-wrap/v1', 'utf8'), 32),
    );
    const brut = Buffer.from(w.ct, 'base64');
    const tag = brut.subarray(brut.length - 16);
    const corps = brut.subarray(0, brut.length - 16);
    const dec = createDecipheriv('aes-256-gcm', kek, Buffer.from(w.nonce, 'base64'));
    dec.setAAD(Buffer.from(deviceId, 'utf8'));
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(corps), dec.final()]);
  }

  it('TÉMOIN : l’appareil A déballe bien SA propre enveloppe', () => {
    // ⚠ Sans lui, les deux refus ci-dessous seraient satisfaits par une
    // enveloppe que PERSONNE ne peut ouvrir — indiscernable d'un chiffrement
    // juste, et plus rassurant.
    const enveloppe = wrapCekForDevice(cek, DEVICE.spkiB64, 'd1');
    expect(deballer(enveloppe, DEVICE.privee, 'd1').equals(cek)).toBe(true);
  });

  it('⚠ une CEK enveloppée pour l’appareil A n’est PAS déballable par B', () => {
    // C'est ce qui fait qu'un blob volé sur un téléphone ne s'ouvre pas sur un
    // autre : le secret ECDH diffère, donc la clé dérivée diffère, donc l'AEAD
    // refuse.
    const autre = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const enveloppe = wrapCekForDevice(cek, DEVICE.spkiB64, 'd1');
    expect(() => deballer(enveloppe, autre.privateKey, 'd1')).toThrow();
  });

  it('⚠ et REJOUÉE sous un autre `deviceId`, elle échoue aussi — l’AAD lie', () => {
    // La bonne clé privée, mais un identifiant d'appareil différent : l'AAD
    // n'authentifie plus. C'est ce qui empêche de recycler une enveloppe pour
    // un second enrôlement du même téléphone.
    const enveloppe = wrapCekForDevice(cek, DEVICE.spkiB64, 'd1');
    expect(() => deballer(enveloppe, DEVICE.privee, 'd2')).toThrow();
  });

  it('⚠ une licence RETOUCHÉE ne passe plus la signature', async () => {
    // Le lien {user, device, tenant, expires} n'a de valeur que si on ne peut
    // pas le réécrire. Ici on prolonge l'expiration d'un an — le geste qu'un
    // porteur de téléphone tenterait.
    const corps = {
      v: 1,
      licenseId: 'l1',
      tenant: 'zinda',
      userId: 'u1',
      deviceId: 'd1',
      docId: 'rec-1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      wrappedCek: { v: 1, epk: 'x', iv: 'y', ct: 'z', tag: 't' },
      segSize: 16384,
      algo: 'aead-seg-gcm-16k/v1',
    } as never;
    const signature = signLicense(corps, CLES.licensePrivateKey);
    const publique = createPublicKey(CLES.licensePrivateKey);

    expect(
      cryptoVerify(null, Buffer.from(canonicalize(corps), 'utf8'), publique, Buffer.from(signature, 'base64')),
    ).toBe(true);

    const retouche = {
      ...(corps as object),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600_000).toISOString(),
    };
    expect(
      cryptoVerify(null, Buffer.from(canonicalize(retouche), 'utf8'), publique, Buffer.from(signature, 'base64')),
      'une licence prolongée à la main passe encore la signature',
    ).toBe(false);
  });
});
