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
      // ⚠ L'ÉTAGÈRE lit `findMany` : une copie PRÊTE, pour que le seul
      // filtre restant soit la décision d'accès — c'est elle qu'on éprouve.
      findMany: vi.fn(async () => [
        {
          recordId: 'rec-1',
          fileFormat: 'PDF',
          encStatus: 'ready',
          record: { id: 'rec-1', title: 'Thèse sous embargo' },
        },
      ]),
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

describe('⚠ « PAS ENCORE PRÉPARÉ » NE SE DIT PAS À UN ÉCHEC DÉFINITIF', () => {
  /**
   * Une seule phrase couvrait QUATRE états de préparation : « Document pas
   * encore préparé pour la lecture hors-ligne. »
   *
   * Pour `failed`, « pas encore » est FAUX — l'ingestion a échoué, et aucune
   * attente n'y changera rien. Le lecteur était invité à revenir demain sur un
   * document qui ne serait jamais prêt sans intervention : un message qui fait
   * AGIR DANS LA MAUVAISE DIRECTION, comme le refus d'accès qu'on vient de
   * dédoubler.
   *
   * ⚠ ET LE QUATRIÈME ÉTAT EST LE PLUS FRÉQUENT : la colonne est NULLABLE et
   * vaut `null` quand l'ingestion n'a jamais été tentée — 154 des 155 copies
   * de l'école de démonstration au 16 septembre 2026.
   */
  const refus = async (encStatus: string | null, fileFormat = 'PDF') => {
    const db = base({ embargoUntil: null });
    // ⚠ `base()` est typée par inférence et le doublage se fait ici : on nomme
    // la forme qu'on atteint, plutôt que de la faire passer par `never`.
    const copies = (db as unknown as {
      digitalCopy: { findUnique: ReturnType<typeof vi.fn> };
    }).digitalCopy;
    copies.findUnique.mockResolvedValue({
      recordId: 'rec-1', encObjectKey: 'k/enc.gafs', encWrappedCek: CEK_ENVELOPPEE,
      encSegSize: 16384, encAlgo: 'aead-seg-gcm-16k/v1', encStatus, fileFormat,
    });
    try {
      await service(db, true).issue(db, TENANT, USER, undefined, {
        docId: 'rec-1', deviceId: 'd1',
      } as never);
      return '';
    } catch (e) {
      return (e as { message: string }).message;
    }
  };

  it('⚠ `failed` fait SIGNALER, pas attendre', async () => {
    const m = await refus('failed');
    expect(m, 'il doit dire que la préparation a ÉCHOUÉ').toMatch(/échou/i);
    expect(m, 'et à qui s’adresser — sans destinataire, un échec est une impasse').toMatch(/bibliothèque/i);
    expect(m, 'il ne doit plus faire patienter').not.toMatch(/pas encore|réessayez|en cours/i);
  });

  it('`pending` fait ATTENDRE — c’est le seul état où c’est vrai', async () => {
    const m = await refus('pending');
    expect(m).toMatch(/en cours|réessayez/i);
    expect(m, 'rien n’a échoué : ne pas envoyer signaler').not.toMatch(/échou/i);
  });

  it('⚠ `null` sur un PDF : jamais TENTÉ — attendre n’y changera rien non plus', async () => {
    const m = await refus(null);
    expect(m).toMatch(/bibliothèque/i);
    expect(m, 'ni « en cours », ni « a échoué » : rien n’a été tenté').not.toMatch(/en cours|réessayez|échou/i);
  });

  it('⚠ `null` sur un EPUB : ce n’est pas un défaut, c’est le format', async () => {
    // Le hors-ligne ne couvre que le PDF — le lecteur natif est PDFium.
    // Envoyer quelqu'un « signaler à la bibliothèque » un état NORMAL serait
    // la même faute dans l'autre sens. (Backlog n° 37.)
    const m = await refus(null, 'EPUB');
    expect(m).toMatch(/EPUB/);
    expect(m, 'il doit dire ce qui RESTE possible').toMatch(/en ligne/i);
    expect(m, 'rien à signaler : cet état est normal').not.toMatch(/échou|signalez/i);
  });
});

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

  it('⚠ LE REFUS NOMME L’EMBARGO ET SA DATE — pas « vous n’avez pas accès »', async () => {
    // ⚠ CE QUE CE TEST DÉFEND, et pourquoi il ne suffit pas de refuser.
    //
    // `hasAccess` rendait un BOOLÉEN : un embargo et un droit manquant
    // sortaient tous deux `false`, et l'appelant levait « Vous n'avez pas
    // accès à ce document ». Le serveur confondait les deux, donc AUCUN client
    // ne pouvait les séparer — le mobile affichait « vous n'avez pas (ou plus)
    // accès », ce qui affirme un RETRAIT qui n'a pas eu lieu.
    //
    // La formule qui dit l'enjeu : un lecteur sous embargo n'a rien à
    // demander, seulement à attendre — et on lui disait le contraire. Il
    // allait réclamer un droit qu'il avait déjà.
    const demain = new Date(Date.now() + 24 * 3600_000);
    const db = base({ embargoUntil: demain });
    let message = '';
    try {
      await service(db, true).issue(db, TENANT, USER, undefined, {
        docId: 'rec-1', deviceId: 'd1',
      } as never);
    } catch (e) {
      message = (e as { message: string }).message;
    }

    // ⚠ ON ÉPROUVE LA PROPRIÉTÉ, PAS LA CONSTANTE. Comparer le message à
    // lui-même le suivrait dans n'importe quelle dégradation : un refus doit
    // NOMMER l'embargo et DATER sa levée, quelle que soit sa rédaction.
    expect(message, 'le refus doit nommer l’embargo').toMatch(/embargo/i);
    expect(message, 'il doit DATER la levée : sans date, « attendez » n’est pas actionnable')
      .toContain(demain.toLocaleDateString('fr-FR'));
    expect(message, 'il ne doit plus être le refus générique de droit')
      .not.toMatch(/n’avez pas accès|n'avez pas accès/i);
  });

  it('⚠ AU PERSONNEL, il ne PROMET PAS ce qui lui est déjà ouvert', async () => {
    // Un étudiant sous embargo n'a pas accès en ligne non plus : le message de
    // la lecture en ligne (« sa description reste consultable ») s'applique
    // tel quel, et il est RÉUTILISÉ. Un bibliothécaire, lui, PEUT lire en
    // ligne — lui servir la même phrase serait un nouveau faux, plus petit
    // mais de même nature que celui qu'on corrige.
    const demain = new Date(Date.now() + 24 * 3600_000);
    const db = base({ embargoUntil: demain });
    let message = '';
    try {
      await service(db, /* document.lire */ true).issue(db, TENANT, USER, undefined, {
        docId: 'rec-1', deviceId: 'd1',
      } as never);
    } catch (e) {
      message = (e as { message: string }).message;
    }
    expect(message, 'le personnel doit s’entendre dire que l’EN LIGNE reste ouvert')
      .toMatch(/en ligne/i);
    expect(message, 'et surtout PAS qu’il devra se contenter de la description')
      .not.toMatch(/description reste consultable/i);
  });

  it('⚠ L’ÉTAGÈRE NE LISTE PAS CE QUE LE TÉLÉCHARGEMENT REFUSE (embargo)', async () => {
    // ⚠ `myDocuments` RÉIMPLÉMENTAIT la décision — la même que `issue` à un
    // contrôle près : l'embargo. Une notice sous embargo apparaissait donc
    // dans l'étagère AVEC son bouton, et le téléchargement échouait un écran
    // plus loin. C'est la promesse non tenue que le mobile venait de retirer
    // de la fiche, reproduite côté SERVEUR — donc incorrigible par un client.
    const demain = new Date(Date.now() + 24 * 3600_000);
    const db = base({ embargoUntil: demain });
    const etagere = await service(db, /* document.lire */ true).myDocuments(db, TENANT, USER);
    expect(etagere, 'sous embargo, l’étagère doit être VIDE').toEqual([]);
  });

  it('⚠ TÉMOIN D’ABSENCE de l’étagère : embargo levé, le document est listé', async () => {
    // Sans lui, une étagère qui rend TOUJOURS vide serait indiscernable d'une
    // étagère juste — et plus rassurante, puisqu'elle ne promettrait rien.
    const db = base({ embargoUntil: null });
    const etagere = await service(db, true).myDocuments(db, TENANT, USER);
    expect(etagere.length, 'sans embargo, le document doit être listé').toBe(1);
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
