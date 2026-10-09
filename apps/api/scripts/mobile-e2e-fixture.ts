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
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠ DEUX RÈGLES POSÉES LE 8 OCTOBRE 2026, demandées par la session mobile après
 * que la notice `E2E MOBILE ÉTAPE 2` — écrite ici DIRECTEMENT en base — a bloqué
 * un push backend.
 *
 * ① **LES DONNÉES PASSENT PAR LES RÈGLES D'ÉCRITURE DU PRODUIT.**
 *
 * `zdb.biblioRecord.create` fabriquait une notice que le produit REFUSE :
 * `recordType: 'Thèse'` n'est même pas du vocabulaire (`RECORD_TYPES` porte
 * `these`, en minuscules et sans accent), et une soutenance sans auteur
 * principal ne passe pas `requirePrincipalAuthor`. Une fixture qui contourne le
 * produit fabrique des états que le produit tient pour invalides — et c'est le
 * TAMIS (`fonds-conforme-en-base.spec.ts`) qui les découvre, plus tard, chez
 * quelqu'un d'autre.
 *
 * ⚠ On passe donc par `CatalogingService.createRecord`, pas par HTTP. Les
 * routes exigeraient une SESSION, c'est-à-dire exactement le geste que
 * `CLAUDE.md` interdit — et ce qu'on veut n'est pas le transport, ce sont les
 * RÈGLES : vocabulaire, auteur principal, champs de soutenance, mots-clés,
 * rattachement aux fiches d'autorité.
 *
 * ② **ON NETTOIE CE QU'ON A POSÉ QUAND ON ÉCHOUE EN COURS DE ROUTE.**
 *
 * ⚠ ET LA FORME LITTÉRALE DEMANDÉE EST FAUSSE : un `finally { cleanup() }` sur
 * `create` détruirait la fixture AU SUCCÈS, juste après l'avoir imprimée —
 * l'e2e n'aurait plus rien à lire, et le script annoncerait une réussite sur
 * une base vide. C'est « le correctif qui fabrique le défaut qu'il répare ».
 *
 * L'intention, elle, est juste et c'est elle qui est posée : un `create` qui
 * LÈVE à la moitié laissait derrière lui une notice, un blob MinIO et une
 * collection que personne ne connaissait, puisque le JSON qui les nomme n'était
 * jamais imprimé. Le registre `pose` les retient au fur et à mesure, et le
 * `catch` les retire AVANT de relever. Le `finally`, lui, ferme les connexions —
 * ce qui est son office.
 * ────────────────────────────────────────────────────────────────────────────
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
import { AuthorsService } from '../src/authors/authors.service';
import { CatalogingService } from '../src/cataloging/cataloging.service';

const ENC_BUCKET = 'digital-copies';
// ⚠ PRÉFIXE `E2E-` : on repère ces notices sans les deviner. Le garde
// `fonds-conforme-en-base.spec.ts` et le tamis cherchent ce préfixe.
const TITLE = 'E2E- MOBILE ÉTAPE 2';
const TITLE_BIG = 'E2E- MESURE PLANCHER — THESE 446 Mo';

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
  // ⚠ ON RÉÉCRIT LE PARAMÈTRE, ON NE LE REMPLACE PAS PAR SUBSTITUTION DE TEXTE.
  //
  // `url.replace('schema=public', …)` ne fait rien quand `DATABASE_URL` ne porte
  // pas EXACTEMENT cette chaîne — un `?schema=public&connection_limit=5`, une
  // autre casse, un `search_path` : la connexion part alors sur `public`, et la
  // fixture écrit dans le GABARIT de toutes les écoles sans un mot.
  //
  // C'est la sixième occurrence de « deux sources qui s'accordent par
  // coïncidence » corrigée dans ce dépôt (16 septembre 2026, sur deux scripts
  // d'exploitation) : la forme juste est `searchParams.set`, qui écrase.
  const url = new URL(process.env.DATABASE_URL as string);
  url.searchParams.set('schema', 'tenant_zinda');
  return {
    pub: new PrismaClient(),
    zdb: new PrismaClient({ datasources: { db: { url: url.toString() } } }),
  };
}

/**
 * Ce que la fixture a POSÉ, dans l'ordre. Le nettoyage le parcourt À L'ENVERS.
 *
 * ⚠ C'est un registre d'EFFETS, pas une liste d'intentions : on y inscrit après
 * que l'écriture a réussi. Inscrire avant ferait tenter la suppression de ce qui
 * n'existe pas — et masquerait, dans le bruit, celle qui compte.
 */
type Pose =
  | { quoi: 'record'; id: string }
  | { quoi: 'digitalCopy'; recordId: string }
  | { quoi: 'collection'; id: string }
  | { quoi: 'accessRule'; id: string }
  | { quoi: 'collectionTitle'; id: string }
  | { quoi: 'objet'; cle: string };

async function defaire(
  pose: Pose[],
  pub: PrismaClient,
  zdb: PrismaClient,
): Promise<void> {
  const t = async (f: () => Promise<unknown>) => {
    // Un retrait qui échoue ne doit pas empêcher les suivants : c'est un
    // nettoyage de panne, et ce qui reste se voit dans la sortie.
    try {
      await f();
    } catch (e) {
      console.error(`  ⚠ retrait incomplet : ${(e as Error).message}`);
    }
  };
  for (const p of [...pose].reverse()) {
    if (p.quoi === 'collectionTitle')
      await t(() => pub.collectionTitle.delete({ where: { id: p.id } }));
    else if (p.quoi === 'accessRule') await t(() => pub.accessRule.delete({ where: { id: p.id } }));
    else if (p.quoi === 'collection') await t(() => pub.collection.delete({ where: { id: p.id } }));
    else if (p.quoi === 'digitalCopy')
      await t(() => zdb.digitalCopy.deleteMany({ where: { recordId: p.recordId } }));
    else if (p.quoi === 'record') await t(() => zdb.biblioRecord.delete({ where: { id: p.id } }));
    else if (p.quoi === 'objet')
      await t(() => s3().send(new DeleteObjectCommand({ Bucket: ENC_BUCKET, Key: p.cle })));
  }
}

/**
 * Le service de catalogage, monté hors de Nest avec ses trois dépendances.
 *
 * ⚠ LES DOUBLURES ÉCHOUENT BRUYAMMENT, sauf celle de la recherche. Un repli
 * silencieux transformerait un oubli de doublure en défaut apparent du produit —
 * et on chercherait dans le code ce qui n'y est pas.
 *
 * ⚠ La recherche, elle, LÈVE exprès : `safeIndex` avale et journalise « lancer
 * /cataloging/reindex plus tard ». La notice de la fixture n'est donc pas
 * indexée, et la sortie le DIT. C'est la dégradation que le produit a déjà
 * écrite, pas une que j'invente ici.
 */
function catalogage() {
  const refus = (nom: string) =>
    new Proxy(
      {},
      {
        get: (_c, methode) => () => {
          throw new Error(
            `doublure non couverte : ${nom}.${String(methode)}() — la fixture ne ` +
              'prévoyait pas cet appel. Prévoyez-le, ne le rendez pas silencieux.',
          );
        },
      },
    );
  const search = {
    ensureIndex: async () => {
      throw new Error('fixture e2e : indexation volontairement non faite');
    },
    indexRecords: async () => undefined,
  };
  return new CatalogingService(
    search as never,
    refus('DigitalCopyService') as never,
    new AuthorsService(),
  );
}

async function create() {
  const { pub, zdb } = clients();
  // ⚠ LE REGISTRE DES EFFETS. Un `create` qui LÈVE à la moitié laissait derrière
  // lui une notice, un blob MinIO et une collection que PERSONNE ne connaissait,
  // puisque le JSON qui les nomme n'est imprimé qu'à la fin. On les retient donc
  // au fur et à mesure, et le `catch` les retire avant de relever.
  const pose: Pose[] = [];
  try {
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

    // ⚠ PAR LE PRODUIT. `recordType: 'these'` (le vocabulaire RÉEL — `RECORD_TYPES`
    // ne porte pas « Thèse »), un auteur PRINCIPAL (sans lui
    // `requirePrincipalAuthor` refuse), l'université de soutenance
    // (`requireDefenseFields` l'exige) et les mots-clés minimaux. Les quatre
    // manquaient à l'écriture directe : c'est exactement ce que le produit aurait
    // refusé, et que le tamis a fini par trouver.
    const record = await catalogage().createRecord(zdb as never, 'zinda', {
      title: TITLE,
      recordType: 'these',
      marcFormat: 'UNIMARC',
      defenseUniversity: 'Université d’Exemple',
      // ⚠ LES DEUX CONTRIBUTEURS SONT OBLIGATOIRES pour une soutenance :
      // `requirePrincipalAuthor` exige l'auteur, `requireDefenseFields` exige
      // le DIRECTEUR. Et `MIN_KEYWORDS = 3`.
      //
      // ⚠ Mesuré en LISANT les trois règles, pas en lançant le script : ma
      // première rédaction donnait deux mots-clés et un seul contributeur. Elle
      // COMPILAIT, et le produit l'aurait refusée dans la main de la session
      // mobile. C'est tout l'intérêt de passer par le produit : les règles
      // vivent au même endroit que l'écriture, donc elles se lisent.
      contributors: [
        { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL' },
        { name: 'Ouédraogo, Salif', role: 'DIRECTEUR_MEMOIRE' },
      ],
      keywords: ['essai', 'mobile', 'lecture hors ligne'],
    } as never);
    pose.push({ quoi: 'record', id: record.id });

    const kek = Buffer.from(process.env.OFFLINE_CONTENT_KEK as string, 'base64');
    const linearized = await ensureValidPdfXref(pdf);
    const cek = generateCek();
    const blob = encryptSegmented(linearized, cek, DEFAULT_SEG_SIZE);
    const encWrappedCek = wrapCekWithKek(cek, kek);
    cek.fill(0);
    const encObjectKey = `${record.id}/enc/${Date.now()}.gafs`;
    await s3().send(new PutObjectCommand({ Bucket: ENC_BUCKET, Key: encObjectKey, Body: blob }));
    pose.push({ quoi: 'objet', cle: encObjectKey });

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
    pose.push({ quoi: 'digitalCopy', recordId: record.id });

    const collection = await pub.collection.create({
      data: { name: TITLE, type: 'INTERNAL', tenantId: tenant.id },
    });
    pose.push({ quoi: 'collection', id: collection.id });
    const rule = await pub.accessRule.create({
      data: { collectionId: collection.id, tenantId: tenant.id, className: 'L1_DROIT' },
    });
    pose.push({ quoi: 'accessRule', id: rule.id });
    const link = await pub.collectionTitle.create({
      data: { collectionId: collection.id, recordId: record.id },
    });
    pose.push({ quoi: 'collectionTitle', id: link.id });

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
  } catch (erreur) {
    // ⚠ ON DÉFAIT, PUIS ON RELÈVE. Avaler l'erreur ici annoncerait un succès sur
    // une base nettoyée — « la trace de succès qui précède l'acte ».
    console.error(
      `✗ fixture interrompue (${(erreur as Error).message}) — retrait de ${pose.length} effet(s) :`,
    );
    await defaire(pose, pub, zdb);
    throw erreur;
  } finally {
    // Le `finally` ferme les connexions, et RIEN D'AUTRE. Y mettre le nettoyage
    // détruirait la fixture AU SUCCÈS, juste après l'avoir imprimée : l'e2e
    // n'aurait plus rien à lire et le script annoncerait une réussite.
    await pub.$disconnect();
    await zdb.$disconnect();
  }
}

/**
 * Variante « gros document » : enregistre un blob GAFS1 EXISTANT (déjà produit par la crypto
 * de contenu) au lieu d'en fabriquer un. La CEK est fournie en hexa et enveloppée par la KEK
 * serveur, comme le ferait l'ingestion. Sert à mesurer la mémoire sur le vrai pire-cas du fonds.
 */
async function createBig(blobPath: string, cekHex: string) {
  const { pub, zdb } = clients();
  // ⚠ LE REGISTRE DES EFFETS. Un `create` qui LÈVE à la moitié laissait derrière
  // lui une notice, un blob MinIO et une collection que PERSONNE ne connaissait,
  // puisque le JSON qui les nomme n'est imprimé qu'à la fin. On les retient donc
  // au fur et à mesure, et le `catch` les retire avant de relever.
  const pose: Pose[] = [];
  try {
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

    // ⚠ PAR LE PRODUIT. `recordType: 'these'` (le vocabulaire RÉEL — `RECORD_TYPES`
    // ne porte pas « Thèse »), un auteur PRINCIPAL (sans lui
    // `requirePrincipalAuthor` refuse), l'université de soutenance
    // (`requireDefenseFields` l'exige) et les mots-clés minimaux. Les quatre
    // manquaient à l'écriture directe : c'est exactement ce que le produit aurait
    // refusé, et que le tamis a fini par trouver.
    const record = await catalogage().createRecord(zdb as never, 'zinda', {
      title: TITLE_BIG,
      recordType: 'these',
      marcFormat: 'UNIMARC',
      defenseUniversity: 'Université d’Exemple',
      // ⚠ LES DEUX CONTRIBUTEURS SONT OBLIGATOIRES pour une soutenance :
      // `requirePrincipalAuthor` exige l'auteur, `requireDefenseFields` exige
      // le DIRECTEUR. Et `MIN_KEYWORDS = 3`.
      //
      // ⚠ Mesuré en LISANT les trois règles, pas en lançant le script : ma
      // première rédaction donnait deux mots-clés et un seul contributeur. Elle
      // COMPILAIT, et le produit l'aurait refusée dans la main de la session
      // mobile. C'est tout l'intérêt de passer par le produit : les règles
      // vivent au même endroit que l'écriture, donc elles se lisent.
      contributors: [
        { name: 'Traoré, Awa', role: 'AUTEUR_PRINCIPAL' },
        { name: 'Ouédraogo, Salif', role: 'DIRECTEUR_MEMOIRE' },
      ],
      keywords: ['essai', 'mobile', 'lecture hors ligne'],
    } as never);
    pose.push({ quoi: 'record', id: record.id });

    const kek = Buffer.from(process.env.OFFLINE_CONTENT_KEK as string, 'base64');
    const encWrappedCek = wrapCekWithKek(Buffer.from(cekHex, 'hex'), kek);
    const encObjectKey = `${record.id}/enc/${Date.now()}.gafs`;
    await s3().send(new PutObjectCommand({ Bucket: ENC_BUCKET, Key: encObjectKey, Body: blob }));
    pose.push({ quoi: 'objet', cle: encObjectKey });

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
    pose.push({ quoi: 'digitalCopy', recordId: record.id });

    const collection = await pub.collection.create({
      data: { name: TITLE_BIG, type: 'INTERNAL', tenantId: tenant.id },
    });
    pose.push({ quoi: 'collection', id: collection.id });
    const rule = await pub.accessRule.create({
      data: { collectionId: collection.id, tenantId: tenant.id, className: 'L1_DROIT' },
    });
    pose.push({ quoi: 'accessRule', id: rule.id });
    const link = await pub.collectionTitle.create({
      data: { collectionId: collection.id, recordId: record.id },
    });
    pose.push({ quoi: 'collectionTitle', id: link.id });

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
  } catch (erreur) {
    // ⚠ ON DÉFAIT, PUIS ON RELÈVE. Avaler l'erreur ici annoncerait un succès sur
    // une base nettoyée — « la trace de succès qui précède l'acte ».
    console.error(
      `✗ fixture interrompue (${(erreur as Error).message}) — retrait de ${pose.length} effet(s) :`,
    );
    await defaire(pose, pub, zdb);
    throw erreur;
  } finally {
    // Le `finally` ferme les connexions, et RIEN D'AUTRE. Y mettre le nettoyage
    // détruirait la fixture AU SUCCÈS, juste après l'avoir imprimée : l'e2e
    // n'aurait plus rien à lire et le script annoncerait une réussite.
    await pub.$disconnect();
    await zdb.$disconnect();
  }
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
