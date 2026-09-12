import {
  createPublicKey,
  createDecipheriv,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  verify as cryptoVerify,
  randomBytes,
} from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCek, wrapCekWithKek } from './content-crypto';
import { canonicalize } from './license-crypto';
import { OfflineLicensesService } from './offline-licenses.service';

const TENANT = { id: 't1', slug: 'zinda', name: 'Zinda' };
const USER = { sub: 'u1', email: 'e@x.bf', role: 'STUDENT', tenant: 'zinda' } as any;

// Clés de test réelles.
const kek = randomBytes(32);
const ed = generateKeyPairSync('ed25519');
const licensePublicKeyPem = ed.publicKey.export({ type: 'spki', format: 'pem' }).toString();
// Appareil = clé EC P-256 (EC-KEM) ; la publique voyage en SPKI DER base64.
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const devicePubB64 = (ec.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64');

/** Déballage EC-KEM côté « appareil » : miroir du DeviceKeystore mobile. */
function unwrapEcKem(wrappedJson: string, devicePrivateKey: any, deviceId: string): Buffer {
  const w = JSON.parse(wrappedJson) as { v: number; epk: string; nonce: string; ct: string };
  expect(w.v).toBe(1);
  const epk = createPublicKey({
    key: Buffer.from(w.epk, 'base64'),
    format: 'der',
    type: 'spki',
  });
  const z = diffieHellman({ privateKey: devicePrivateKey, publicKey: epk });
  const kekWrap = Buffer.from(
    hkdfSync('sha256', z, Buffer.alloc(0), Buffer.from('gafeso/cek-wrap/v1', 'utf8'), 32),
  );
  const raw = Buffer.from(w.ct, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', kekWrap, Buffer.from(w.nonce, 'base64'));
  decipher.setAAD(Buffer.from(deviceId, 'utf8'));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]);
}

const cek = generateCek();
const wrappedByKek = wrapCekWithKek(cek, kek);

function makeDeps(overrides: { granted?: boolean; readsAll?: boolean } = {}) {
  const keys = { contentKek: kek, licensePrivateKey: ed.privateKey, licensePublicKeyPem };
  const authz = { hasFunction: vi.fn().mockResolvedValue(overrides.readsAll ?? false) };
  const access = {
    buildStudentContext: vi.fn().mockResolvedValue({ tenantId: 't1', className: 'L1', subscriptionTier: 'free' }),
    getRecordAccessStatus: vi.fn().mockResolvedValue({ granted: overrides.granted ?? true }),
  };
  const prisma = {
    tenantSettings: { findUnique: vi.fn().mockResolvedValue({ offlineLicenseTtlDays: 14 }) },
  };
  const audit = { log: vi.fn() };
  const storage = { getSignedDownloadUrl: vi.fn().mockResolvedValue('https://minio.test/signed') };
  const service = new OfflineLicensesService(
    prisma as never,
    authz as never,
    access as never,
    keys as never,
    audit as never,
    storage as never,
  );
  return { service, authz, access, audit, storage };
}

function makeDb(over: Record<string, any> = {}) {
  return {
    // ⚠ `biblioRecord` EXIGÉ DEPUIS P6-4 : l'émission de licence consulte
    // l'embargo de la notice — pour TOUT LE MONDE, personnel compris. Un
    // document sous embargo ne sort pas sur un appareil, où la licence survit
    // à la découverte de l'erreur. Ici, aucune notice n'est sous embargo.
    biblioRecord: { findUnique: vi.fn().mockResolvedValue({ embargoUntil: null }) },
    device: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'dev1',
        userId: 'u1',
        publicKey: devicePubB64,
        revokedAt: null,
      }),
    },
    digitalCopy: {
      findUnique: vi.fn().mockResolvedValue({
        recordId: 'rec1',
        encStatus: 'ready',
        encWrappedCek: wrappedByKek,
        encObjectKey: 'rec1/enc/1.gafs',
        encSegSize: 16384,
        encAlgo: 'aead-seg-gcm-16k/v1',
      }),
    },
    offlineLicense: {
      create: vi.fn(async ({ data }: any) => ({ id: 'lic1', ...data })),
      // UPSERT sur le triplet (utilisateur, appareil, document) : réémettre
      // PROLONGE la licence au lieu d'en créer une seconde.
      upsert: vi.fn(async ({ create }: any) => ({ id: 'lic1', ...create })),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(async ({ data }: any) => ({ id: 'lic1', ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    ...over,
  } as any;
}

describe('OfflineLicensesService', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps({ readsAll: true });
  });

  it('REFUSE l’émission sans droit — aucune licence créée (CEK jamais touchée)', async () => {
    const d = makeDeps({ readsAll: false, granted: false });
    const db = makeDb();
    await expect(
      d.service.issue(db, TENANT as any, USER, '1.2.3.4', { docId: 'rec1', deviceId: 'dev1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.offlineLicense.upsert).not.toHaveBeenCalled();
    expect(db.digitalCopy.findUnique).not.toHaveBeenCalled(); // droit vérifié AVANT la CEK
  });

  it('REFUSE si l’appareil n’appartient pas à l’utilisateur', async () => {
    const db = makeDb();
    db.device.findUnique.mockResolvedValue({ id: 'dev1', userId: 'AUTRE', publicKey: devicePubB64 });
    await expect(
      deps.service.issue(db, TENANT as any, USER, '1.2.3.4', { docId: 'rec1', deviceId: 'dev1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('émet une licence signée Ed25519, liée {user,device,tenant,expires}, CEK enveloppée pour l’appareil', async () => {
    const db = makeDb();
    const res = await deps.service.issue(db, TENANT as any, USER, '1.2.3.4', {
      docId: 'rec1',
      deviceId: 'dev1',
    });

    // Licence liée
    expect(res.body).toMatchObject({
      docId: 'rec1',
      tenant: 'zinda',
      userId: 'u1',
      deviceId: 'dev1',
      rights: { watermark: true, noPrint: true },
    });
    // TTL 14 j
    const days = (new Date(res.body.expiresAt).getTime() - new Date(res.body.issuedAt).getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(14);

    // Signature Ed25519 vérifiable avec la clé publique serveur
    const ok = cryptoVerify(
      null,
      Buffer.from(canonicalize(res.body), 'utf8'),
      ed.publicKey,
      Buffer.from(res.signature, 'base64'),
    );
    expect(ok).toBe(true);

    // La CEK enveloppée se déballe avec la clé PRIVÉE de l’appareil → == CEK d’origine
    // EC-KEM : ECDH(device_priv, epk) + HKDF-SHA256 + AES-256-GCM (AAD = deviceId).
    const recovered = unwrapEcKem(res.wrappedCek, ec.privateKey, 'dev1');
    expect(recovered.equals(cek)).toBe(true);

    // Audit d’émission
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'offline.license.issue', targetId: 'lic1' }),
    );
  });

  it('status : révoqué (revokedAt) > expiré > accès perdu → revoked ; sinon active', async () => {
    const db = makeDb();
    // révoqué explicitement
    db.offlineLicense.findUnique.mockResolvedValueOnce({
      id: 'lic1',
      recordId: 'rec1',
      userId: 'u1',
      status: 'revoked',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1e9),
    });
    expect((await deps.service.status(db, TENANT as any, USER, 'lic1')).status).toBe('revoked');

    // expiré
    db.offlineLicense.findUnique.mockResolvedValueOnce({
      id: 'lic1',
      recordId: 'rec1',
      userId: 'u1',
      status: 'active',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await deps.service.status(db, TENANT as any, USER, 'lic1')).status).toBe('expired');

    // accès perdu (droit rejoué) → révocation
    const lost = makeDeps({ readsAll: false, granted: false });
    db.offlineLicense.findUnique.mockResolvedValueOnce({
      id: 'lic1',
      recordId: 'rec1',
      userId: 'u1',
      status: 'active',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1e9),
    });
    expect((await lost.service.status(db, TENANT as any, USER, 'lic1')).status).toBe('revoked');
    expect(db.offlineLicense.update).toHaveBeenCalled(); // persiste la révocation
  });

  it('status active quand tout est bon', async () => {
    const db = makeDb();
    db.offlineLicense.findUnique.mockResolvedValue({
      id: 'lic1',
      recordId: 'rec1',
      userId: 'u1',
      status: 'active',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1e9),
    });
    expect((await deps.service.status(db, TENANT as any, USER, 'lic1')).status).toBe('active');
  });
});

describe('OfflineLicensesService — licence inconnue ≠ révoquée', () => {
  it('entitlements renvoie « unknown » pour un identifiant que le serveur ignore', async () => {
    // `revoked` signifiait « le droit a été retiré » ; l'appareil purgeait donc
    // le document téléchargé. Une restauration de sauvegarde antérieure à
    // l'émission suffisait à détruire l'ouvrage d'un étudiant, avec un message
    // faux (« n'est plus accessible »). `unknown` dit « je ne sais pas ».
    const db = makeDb() as any;
    db.offlineLicense.findMany = vi.fn().mockResolvedValue([]);
    const { service } = makeDeps();

    const res = await service.entitlements(db, TENANT as never, USER, ['inexistante-1', 'inexistante-2']);

    expect(res).toEqual([
      { id: 'inexistante-1', status: 'unknown', expiresAt: null },
      { id: 'inexistante-2', status: 'unknown', expiresAt: null },
    ]);
    expect(res.some((r) => r.status === 'revoked')).toBe(false);
  });
});

describe('OfflineLicensesService — propriété des licences', () => {
  it('status() refuse la licence d’un AUTRE utilisateur', async () => {
    // Le contrôle manquait ici alors que blobUrl() le faisait. Au-delà de la
    // fuite d'information, effectiveStatus() ÉCRIT : une lecture non autorisée
    // pouvait révoquer la licence d'autrui.
    const db = makeDb() as any;
    db.offlineLicense.findUnique = vi.fn().mockResolvedValue({
      id: 'lic-autre',
      userId: 'quelqu-un-dautre',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const { service } = makeDeps();

    await expect(
      service.status(db, TENANT as never, USER, 'lic-autre'),
    ).rejects.toThrow(/autre utilisateur/i);
    // Aucune écriture déclenchée par cette lecture refusée.
    expect(db.offlineLicense.update).not.toHaveBeenCalled();
  });

  it('entitlements() borne la requête aux licences de l’appelant', async () => {
    const db = makeDb() as any;
    db.offlineLicense.findMany = vi.fn().mockResolvedValue([]);
    const { service } = makeDeps();

    const res = await service.entitlements(db, TENANT as never, USER, ['lic-autre']);

    // Le filtre porte sur userId : impossible de viser la licence d'un tiers.
    expect(db.offlineLicense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER.sub }) }),
    );
    // Et la réponse ne confirme pas son existence.
    expect(res).toEqual([{ id: 'lic-autre', status: 'unknown', expiresAt: null }]);
  });
});
