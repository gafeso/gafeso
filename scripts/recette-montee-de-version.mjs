#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// LA MONTÉE DE VERSION NE PERD RIEN — éprouvée sur une lignée PROPRE.
//
// ## Ce que cette recette prouve, et ce qu'elle ne prouve pas
//
// Une fois un établissement en production, chaque version doit migrer ses
// données sans casse. Ce qui peut casser n'est pas le code : c'est
// `prisma migrate deploy` appliqué à une base qui porte DÉJÀ des données.
//
// Elle éprouve donc :
//   ① une base montée jusqu'à une version ANTÉRIEURE, puis remplie ;
//   ② la montée à la version COURANTE, par la commande EXACTE du conteneur ;
//   ③ les données INTACTES — comptes, notices, exemplaires, prêts ;
//   ④ ⭐ un document chiffré encore DÉCHIFFRABLE, octet pour octet.
//
// ⚠ CE QU'ELLE NE PROUVE PAS, et il faut le dire : elle ne monte pas les
// conteneurs. Elle n'éprouve donc ni MinIO, ni Meilisearch, ni le front. Le blob
// chiffré n'est pas déposé dans un objet — mais la CEK ENVELOPPÉE, elle, vit en
// BASE, et c'est la seule chose qu'une migration peut perdre. C'est pourquoi ④
// est la bonne mesure : si la CEK se désenveloppe encore et déchiffre les mêmes
// octets, le contenu protégé a survécu.
//
// ⚠ ET ELLE N'ÉCRIT PAS PAR LES ROUTES DU PRODUIT. C'est un écart assumé, pas
// un oubli : l'objet mesuré est la MIGRATION, et faire passer les données par
// l'API demanderait de monter l'API deux fois — une par version — sur une base
// qui n'a pas encore son schéma courant. Le tamis reste le garde qui confronte
// les écrivains directs aux règles du produit ; celui-ci confronte un SCHÉMA à
// ses données.
//
// ## Usage
//
//   node scripts/recette-montee-de-version.mjs [--depuis <n>]
//
// `--depuis` est le nombre de migrations à NE PAS appliquer d'abord : la version
// « antérieure » est donc `total - n`. Par défaut 3 — les migrations du jour.
//
// ⚠ Elle crée et DÉTRUIT une base jetable. Elle ne touche jamais `bibliocloud`,
// et le contrôle final est une DIFFÉRENCE D'ENSEMBLES contre le recensement des
// bases pris au départ — jamais « j'ai supprimé ce que j'ai créé ».
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const RACINE = join(import.meta.dirname, '..');
const MIGRATIONS = join(RACINE, 'apps/api/prisma/migrations');
const ROUGE = '\x1b[0;31m', VERT = '\x1b[0;32m', GRIS = '\x1b[0;90m', JAUNE = '\x1b[0;33m', FIN = '\x1b[0m';
const ok = (m) => console.log(`${VERT}✓${FIN} ${m}`);
const info = (m) => console.log(`${GRIS}   ${m}${FIN}`);
const alerte = (m) => console.log(`${JAUNE}⚠${FIN} ${m}`);
const titre = (m) => console.log(`\n${GRIS}── ${m}${FIN}`);
const echec = (m) => { console.error(`${ROUGE}✗ ${m}${FIN}`); process.exitCode = 1; };

const RECULE = Number(process.argv.includes('--depuis')
  ? process.argv[process.argv.indexOf('--depuis') + 1] : 3);

const base = process.env.DATABASE_URL;
if (!base) { echec('DATABASE_URL absente.'); process.exit(2); }
const BASE_JETABLE = `gafeso_reprise_${Date.now().toString(36)}`;
const urlAdmin = new URL(base);
const urlJetable = new URL(base);
urlJetable.pathname = `/${BASE_JETABLE}`;
urlJetable.searchParams.set('schema', 'public');

// ⚠ TOUT PASSE PAR PRISMA, PAS PAR `psql`. Le client n'est pas forcément
// installé sur l'hôte — il ne l'est pas sur le nôtre — et `docker exec` nommerait
// un conteneur, donc une installation particulière. Une recette qui ne tourne que
// sur une machine n'est pas une recette.
const admin = new PrismaClient({ datasources: { db: { url: base } } });

/** `CREATE`/`DROP DATABASE` ne peuvent PAS vivre dans une transaction. */
const horsTransaction = (sql) => admin.$executeRawUnsafe(sql);

const basesExistantes = async () =>
  (await admin.$queryRawUnsafe('SELECT datname FROM pg_database WHERE datistemplate = false'))
    .map((r) => r.datname)
    .sort();

/**
 * `prisma migrate deploy` — LA COMMANDE EXACTE du point d'entrée du conteneur.
 *
 * ⚠ ON LUI DONNE UN SCHÉMA, PAS UN DOSSIER DE MIGRATIONS. Prisma cherche
 * `migrations/` À CÔTÉ du schéma : il n'existe aucune variable pour le déplacer.
 * Ma première version passait un `PRISMA_MIGRATIONS_PATH` qui n'existe pas —
 * Prisma a donc appliqué les 43 migrations au lieu de 40, et la recette aurait
 * « passé » en montant une base neuve jusqu'au courant puis en n'y changeant
 * rien. C'est le témoin de COMPTE qui l'a dit, pas une relecture.
 */
function migrer(cheminDuSchema) {
  execFileSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy',
    `--schema=${cheminDuSchema}`], {
    cwd: RACINE,
    env: { ...process.env, DATABASE_URL: urlJetable.toString() },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  const AVANT = await basesExistantes();
  info(`${AVANT.length} bases au recensement de départ`);

  const toutes = readdirSync(MIGRATIONS).filter((d) => !d.startsWith('migration_lock')).sort();
  if (RECULE < 1 || RECULE >= toutes.length) { echec(`--depuis ${RECULE} hors bornes (1..${toutes.length - 1})`); return; }
  const anterieures = toutes.slice(0, toutes.length - RECULE);
  const restantes = toutes.slice(toutes.length - RECULE);

  titre('Les deux versions');
  info(`version ANTÉRIEURE : ${anterieures.length} migrations (jusqu’à ${anterieures.at(-1)})`);
  info(`version COURANTE  : +${restantes.length} — ${restantes.join(', ')}`);

  // ── Un dossier de migrations TRONQUÉ, pour jouer la version antérieure ──
  //
  // ⚠ On COPIE plutôt que de déplacer : toucher `apps/api/prisma/migrations`
  // laisserait l'arbre du dépôt dans un état intermédiaire si la recette échoue
  // au milieu — et un `git checkout` de nettoyage emporterait du travail non
  // commité. C'est la faute du 26 septembre, et elle ne se refait pas.
  const bac = mkdtempSync(join(tmpdir(), 'gafeso-reprise-'));
  const schemaAnterieur = join(bac, 'schema.prisma');
  const dossierAnterieur = join(bac, 'migrations');
  cpSync(join(RACINE, 'apps/api/prisma/schema.prisma'), schemaAnterieur);
  cpSync(join(MIGRATIONS, 'migration_lock.toml'), join(dossierAnterieur, 'migration_lock.toml'));
  for (const m of anterieures) cpSync(join(MIGRATIONS, m), join(dossierAnterieur, m), { recursive: true });

  let db = null;
  try {
    titre(`Base jetable « ${BASE_JETABLE} »`);
    await horsTransaction(`CREATE DATABASE "${BASE_JETABLE}"`);
    ok('créée');

    titre('① La version ANTÉRIEURE est installée');
    migrer(schemaAnterieur);
    db = new PrismaClient({ datasources: { db: { url: urlJetable.toString() } } });
    const n1 = Number(
      (await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM public._prisma_migrations'))[0].n,
    );
    ok(`${n1} migrations appliquées`);
    if (n1 !== anterieures.length) {
      echec(`${n1} appliquées pour ${anterieures.length} attendues — la troncature n’a pas pris`);
      return;
    }

    titre('② On y met des données');
    const temoin = await semer(db);
    ok(`${temoin.resume}`);

    titre('③ Montée à la version COURANTE — la commande du conteneur');
    migrer(join(RACINE, 'apps/api/prisma/schema.prisma'));
    await db.$disconnect();
    db = new PrismaClient({ datasources: { db: { url: urlJetable.toString() } } });
    const n2 = Number(
      (await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM public._prisma_migrations'))[0].n,
    );
    ok(`${n2} migrations (${anterieures.length} → ${n2})`);
    if (n2 !== toutes.length) { echec(`${n2} pour ${toutes.length} attendues`); return; }

    titre('④ LES DONNÉES SONT-ELLES INTACTES ?');
    // ⚠ UNE PERTE DE COLONNE LÈVE DANS PRISMA, PAS DANS MON ASSERTION. Le
    // contrôle négatif (une migration qui retire `enc_wrapped_cek`) sortait en
    // trace du client — ce qui envoie lire les entrailles de Prisma au lieu de
    // la migration fautive. On la traduit : le message doit nommer LA PERTE.
    try {
      await verifier(db, temoin);
    } catch (e) {
      const colonne = /P2022|does not exist/.test(String(e?.message))
        ? String(e.message).match(/`([a-z_]+\.[a-z_]+)`/)?.[1]
        : null;
      if (colonne) {
        echec(
          `LA MONTÉE DE VERSION A PERDU « ${colonne} ».\n` +
            '   Une migration de ce lot retire une colonne que les données ' +
            'emploient. C’est exactement ce que cette recette existe pour ' +
            'attraper — et chez un établissement en production, ce serait ' +
            'irréversible.',
        );
      } else {
        echec(`vérification interrompue : ${e?.message ?? e}`);
      }
    }
  } finally {
    if (db) await db.$disconnect().catch(() => {});
    titre('Nettoyage, par DIFFÉRENCE d’ensembles');
    try {
      await horsTransaction(`DROP DATABASE IF EXISTS "${BASE_JETABLE}" WITH (FORCE)`);
    } catch (e) { alerte(`la base jetable n’a pas pu être retirée : ${e.message}`); }
    rmSync(bac, { recursive: true, force: true });
    const APRES = await basesExistantes();
    const surnumeraires = APRES.filter((b) => !AVANT.includes(b));
    if (surnumeraires.length === 0) ok('aucune base en plus du recensement de départ');
    else echec(`base(s) survivante(s) : ${surnumeraires.join(', ')}`);
    await admin.$disconnect();
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// Le jeu d'essai, et ce qu'on en vérifie
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠ LE DOCUMENT PROTÉGÉ EST CHIFFRÉ AVEC LA CRYPTO DU PRODUIT, pas avec la
 * mienne. `wrapCekWithKek` est importé de `dist/` : une recette qui réécrirait
 * l'enveloppe mesurerait sa propre implémentation, et passerait au vert le jour
 * où le produit changerait la sienne.
 */
async function cryptoDuProduit() {
  const m = await import(
    new URL('../apps/api/dist/offline-licensing/content-crypto.js', import.meta.url).href
  );
  return m;
}

async function semer(db) {
  const { generateCek, encryptSegmented, wrapCekWithKek } = await cryptoDuProduit();
  const KEK = Buffer.from(process.env.OFFLINE_CONTENT_KEK ?? '', 'base64');
  if (KEK.length !== 32) throw new Error('OFFLINE_CONTENT_KEK absente ou invalide (32 octets base64)');

  // Un PDF minimal mais RÉEL : c'est son déchiffrement qu'on vérifiera.
  const clair = Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    randomBytes(4096),
    Buffer.from('\n%%EOF\n'),
  ]);
  const cek = generateCek();
  const blob = encryptSegmented(clair, cek);
  const enveloppe = wrapCekWithKek(cek, KEK);

  const notice = await db.biblioRecord.create({
    data: {
      title: 'Notice témoin de montée de version',
      author: 'Traoré, Awa',
      recordType: 'these',
      defenseUniversity: 'Université d’Exemple',
      language: 'fr',
      marcData: {},
    },
  });
  await db.recordContributor.create({
    data: { recordId: notice.id, name: 'Ouédraogo, Salif', role: 'DIRECTEUR_MEMOIRE', position: 1 },
  });
  const exemplaire = await db.item.create({
    data: { recordId: notice.id, barcode: 'REPRISE-0001', status: 'CHECKED_OUT' },
  });
  const adherent = await db.patron.create({
    data: { barcode: 'ADH-REPRISE-1', firstName: 'Awa', lastName: 'Traoré', category: 'etudiant' },
  });
  const pret = await db.checkout.create({
    data: {
      itemId: exemplaire.id,
      patronId: adherent.id,
      checkoutDate: new Date('2026-09-01T08:00:00Z'),
      dueDate: new Date('2026-09-22T17:00:00Z'),
    },
  });
  const compte = await db.user.create({
    data: {
      email: 'temoin-reprise@exemple.bf',
      firstName: 'Témoin',
      lastName: 'Reprise',
      role: 'ADMIN',
      status: 'ACTIVE',
      activatedAt: new Date('2026-09-01T08:00:00Z'),
    },
  });
  const copie = await db.digitalCopy.create({
    data: {
      recordId: notice.id,
      // ⚠ L'énumération dit `PDF`, pas `pdf`. Troisième correction du même
      // jeu d'essai, et la même cause : je l'écrivais d'après ce que je croyais
      // du schéma. Le refus de Prisma est ici un service — il ne laisse rien
      // passer en silence.
      fileFormat: 'PDF',
      objectKey: 'reprise/temoin.pdf',
      // ⚠ `fileSizeBytes` et `encSegSize` — je les avais devinés `fileSize` et
      // `encSegmentSize`, et Prisma a refusé. Un jeu d'essai écrit d'après ce
      // qu'on croit du schéma est la même faute qu'une doublure écrite d'après
      // ce qu'on croit d'une API : ici le refus est immédiat, et c'est une
      // chance — une colonne optionnelle mal nommée serait passée en silence.
      fileSizeBytes: clair.length,
      originalName: 'temoin.pdf',
      encStatus: 'ready',
      encObjectKey: 'reprise/temoin.enc',
      encWrappedCek: enveloppe,
      encSegSize: 16384,
      encAlgo: 'aead-seg-gcm-16k/v1',
      encryptedAt: new Date('2026-09-01T09:00:00Z'),
    },
  });

  return {
    resume:
      '1 notice (+ son directeur), 1 exemplaire, 1 adhérent, 1 prêt ouvert, ' +
      '1 compte ADMIN, 1 document CHIFFRÉ',
    ids: {
      notice: notice.id, exemplaire: exemplaire.id, adherent: adherent.id,
      pret: pret.id, compte: compte.id, copie: copie.id,
    },
    empreinteDuClair: createHash('sha256').update(clair).digest('hex'),
    tailleDuClair: clair.length,
    blob,
  };
}

async function verifier(db, t) {
  const { decryptSegment, unwrapCekWithKek } = await cryptoDuProduit();
  const KEK = Buffer.from(process.env.OFFLINE_CONTENT_KEK ?? '', 'base64');
  let fautes = 0;
  const dire = (bon, texte) => { bon ? ok(texte) : (echec(texte), fautes++); };

  // ── Les lignes sont-elles là, et les MÊMES ?
  const notice = await db.biblioRecord.findUnique({
    where: { id: t.ids.notice },
    include: { contributors: true, items: true, digitalCopy: true },
  });
  dire(!!notice, 'la notice a survécu');
  dire(notice?.title === 'Notice témoin de montée de version', 'son titre est intact');
  dire(notice?.contributors.length === 1, 'son directeur de thèse est intact');
  dire(notice?.items.length === 1, 'son exemplaire est intact');

  const pret = await db.checkout.findUnique({ where: { id: t.ids.pret } });
  dire(!!pret && pret.returnDate === null, 'le prêt est toujours OUVERT');
  dire(
    pret?.dueDate?.toISOString() === '2026-09-22T17:00:00.000Z',
    'son échéance n’a pas bougé d’une seconde',
  );

  const compte = await db.user.findUnique({ where: { id: t.ids.compte } });
  dire(compte?.status === 'ACTIVE', 'le compte est toujours ACTIVE');
  dire(
    compte?.activatedAt?.toISOString() === '2026-09-01T08:00:00.000Z',
    'sa date d’activation est intacte',
  );

  // ── ⭐ ET LE DOCUMENT CHIFFRÉ EST-IL ENCORE LISIBLE ?
  //
  // C'est la mesure qui compte. Les comptes ci-dessus diraient « intact » même si
  // la CEK enveloppée avait été tronquée par un changement de colonne : une
  // chaîne reste une chaîne. Seul le DÉCHIFFREMENT le dit.
  const copie = await db.digitalCopy.findUnique({ where: { id: t.ids.copie } });
  dire(!!copie?.encWrappedCek, 'la CEK enveloppée est encore en base');
  try {
    const cek = unwrapCekWithKek(copie.encWrappedCek, KEK);
    dire(cek.length === 32, 'la CEK se DÉSENVELOPPE encore sous la KEK');
    const segments = [];
    for (let i = 0; ; i += 1) {
      try { segments.push(decryptSegment(t.blob, i, cek)); } catch { break; }
    }
    const relu = Buffer.concat(segments);
    dire(relu.length === t.tailleDuClair, `${relu.length} octets déchiffrés sur ${t.tailleDuClair}`);
    dire(
      createHash('sha256').update(relu).digest('hex') === t.empreinteDuClair,
      '⭐ LE DOCUMENT CHIFFRÉ EST DÉCHIFFRÉ OCTET POUR OCTET — empreinte identique',
    );
  } catch (e) {
    echec(`le document chiffré n’est PLUS lisible : ${e.message}`);
    fautes++;
  }

  if (fautes === 0) ok('\n  ⭐ LA MONTÉE DE VERSION N’A RIEN PERDU.');
  else echec(`${fautes} vérification(s) en échec`);
}

export default main;

await main();
