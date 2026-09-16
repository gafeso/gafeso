#!/usr/bin/env node
/**
 * RATTRAPAGE — les documents numériques passent par le produit.
 *
 * ⚠ CE QU'IL RÉPARE. `seed-demo.mjs` attachait les documents par
 * `digitalCopy.createMany`, donc sans jamais lancer l'ingestion hors-ligne.
 * Mesuré sur `zinda` : 155 documents, **UN SEUL** prêt pour le hors-ligne.
 * L'étagère mobile en aurait montré un ; la fiche en promettait 155.
 *
 * Le seed est corrigé pour le neuf ; ce script répare l'existant.
 *
 *   node scripts/rattraper-documents-numeriques.mjs --ecole=zinda
 *   node scripts/rattraper-documents-numeriques.mjs --ecole=zinda --appliquer
 *
 * ⚠ IL A BESOIN DE L'API EN SERVICE et d'une session de bibliothécaire, prise
 * par le CHEMIN NORMAL : `SEED_PASSWORD` est le mot de passe du compte de
 * démonstration, jamais un jeton fabriqué. Sans lui, le script s'arrête en le
 * disant.
 *
 * ⚠ IDEMPOTENT, et c'est VÉRIFIÉ en le lançant DEUX FOIS — jamais en le
 * relisant (leçon du 16 septembre). Il vise un ÉTAT : « aucune copie hors
 * `ready` », pas « N téléversements ».
 *
 * LECTURE SEULE par défaut.
 */
import { loadEnvIfPresent } from './lib/load-env.mjs';
import { ouvrirEcole, RACINE } from './lib/base-tenant.mjs';
import { assurerLesDocumentsNumeriques } from './lib/documents-numeriques.mjs';
import { join } from 'node:path';

loadEnvIfPresent(join(RACINE, '.env'));

const args = process.argv.slice(2);
const appliquer = args.includes('--appliquer');
const ecole = args.find((a) => a.startsWith('--ecole='))?.slice(8);
const API = process.env.SEED_API_URL ?? 'http://localhost:4000';
const COMPTE = args.find((a) => a.startsWith('--compte='))?.slice(9) ?? 'bib@exemple.bf';

if (!ecole) { console.error('⚠ --ecole=<slug> est obligatoire.'); process.exit(2); }

let db;
try { db = await ouvrirEcole(ecole); }
catch (e) { console.error(`⚠ ${e.message}`); process.exit(2); }

try {
  const total = await db.digitalCopy.count();
  const prets = await db.digitalCopy.count({ where: { encStatus: 'ready' } });
  // ⚠ `NOT: { encStatus: 'ready' }` NE PREND PAS LES NULL : en SQL,
  // `enc_status <> 'ready'` vaut NULL — donc pas TRUE — quand la colonne est
  // nulle. Or « ingestion jamais tentée » EST l'état de 154 des 155 copies.
  // La première écriture rendait « 0 à reprendre » pour 1 prête sur 155 :
  // c'est l'ARITHMÉTIQUE qui l'a dit, pas la relecture.
  const aReprendre = await db.digitalCopy.findMany({
    where: { OR: [{ encStatus: null }, { encStatus: { not: 'ready' } }] },
    select: { recordId: true, fileFormat: true },
  });
  const pdf = aReprendre.filter((c) => c.fileFormat === 'PDF');
  const autres = aReprendre.filter((c) => c.fileFormat !== 'PDF');

  console.log(`${ecole} : ${total} document(s) numérique(s), ${prets} prêt(s) pour le hors-ligne.`);
  if (prets + aReprendre.length !== total) {
    console.error(`⚠ ARITHMÉTIQUE FAUSSE : ${prets} prêts + ${aReprendre.length} à reprendre ≠ ${total}.`);
    console.error("  Le relevé ne voit pas tout — corrigez-le avant de croire sa sortie.");
    process.exit(1);
  }
  console.log(`  à reprendre : ${pdf.length} PDF${autres.length ? ` (+ ${autres.length} non-PDF, IGNORÉS)` : ''}`);
  if (autres.length) {
    // ⚠ Un EPUB n'est PAS un défaut ici : le hors-ligne ne couvre que le PDF,
    // parce que le lecteur natif est PDFium. Voir backlog n° 37.
    console.log('  ⚠ les non-PDF ne sont pas un défaut : le hors-ligne ne couvre que le PDF (backlog n° 37).');
  }

  if (!appliquer) { console.log('\nRien écrit (mode lecture — ajoutez --appliquer).'); process.exit(0); }
  if (!pdf.length) { console.log('\nRien à faire.'); process.exit(0); }

  const motDePasse = process.env.SEED_PASSWORD;
  if (!motDePasse) {
    console.error(
      '\n⚠ SEED_PASSWORD absent. Ce script passe par le CHEMIN NORMAL : il se connecte\n' +
        `  en ${COMPTE} pour téléverser par la route du produit. Aucun jeton n’est fabriqué.\n` +
        "  SEED_PASSWORD='<le mot de passe du compte>' node scripts/rattraper-documents-numeriques.mjs …",
    );
    process.exit(2);
  }

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Host: 'localhost' },
    body: JSON.stringify({ email: COMPTE, password: motDePasse }),
  });
  if (!login.ok) { console.error(`⚠ connexion ${COMPTE} refusée (HTTP ${login.status}) — l’API est-elle en service ?`); process.exit(2); }
  const { accessToken } = await login.json();
  if (!accessToken) { console.error('⚠ connexion sans jeton (2FA exigée ?) — reprenez avec un compte sans 2FA.'); process.exit(2); }

  // Le même PDF d'exemple que le seed, relu depuis le dépôt : on ne fabrique
  // pas un second document de démonstration.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(RACINE, 'scripts', 'seed-demo.mjs'), 'utf8');
  const fn = src.match(/function construirePdfDExemple\(\)[\s\S]*?\n\}/)[0];
  const pdfBuf = eval(`(${fn.replace('function construirePdfDExemple()', '()=>')})`)();

  const r = await assurerLesDocumentsNumeriques({
    db, api: API, token: accessToken, pdf: pdfBuf,
    nomFichier: 'document-d-exemple.pdf',
    cibler: async () => pdf.map((c) => c.recordId),
  });
  console.log(`\n✓ ${r.televerses} téléversement(s), ${r.nouveaux} document(s) devenu(s) prêt(s) (attendu ${r.examines})`);
  for (const e of r.echecs.slice(0, 5)) console.log(`  ⚠ ${e}`);
  if (r.nouveaux !== r.examines) { console.error('⚠ ÉCART entre le prévu et l’apparu — relisez avant de continuer.'); process.exitCode = 1; }
} finally {
  await db.$disconnect();
}
