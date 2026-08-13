// Seed de démonstration Gafeso — établissement fictif.
//
// Idempotent : rejouable après n'importe quel redémarrage/rollback Docker.
// Reconstruit tout : école provisionnée, comptes (personnel + étudiants),
// classes, liste des attendus, catalogue, exemplaires, adhérents, règles de
// prêt, puis réindexe Meilisearch.
//
// Réservé au développement/démo — REFUSE toute cible non locale (voir le
// garde-fou plus bas). Le mot de passe des comptes est tiré au hasard et
// affiché en fin d'exécution ; SEED_PASSWORD permet de le fixer.
//
// pour un premier provisioning de production, voir scripts/provision-production.mjs.
//
// Prérequis : l'API doit tourner. Lancer depuis la racine :
//   npm run seed:demo
// En dev, les variables viennent de .env (chargé automatiquement s'il est
// présent — voir scripts/lib/load-env.mjs). En production (conteneur Docker,
// pas de fichier .env), les variables sont déjà dans l'environnement :
//   docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
//     exec api node scripts/seed-demo.mjs
//
// Le mot de passe des comptes est tiré au hasard et affiché à la fin.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { loadEnvIfPresent } from './lib/load-env.mjs';

loadEnvIfPresent();

const API = process.env.SEED_API_URL ?? 'http://localhost:4000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev_admin_key_local';
const SLUG = 'zinda'; // slug technique (le nom affiché est celui de SCHOOL)
const SCHOOL = 'Université d’Exemple';

// ⚠ GARDE-FOU DE CIBLE. Ce seed CRÉE une école entière avec des comptes dont
// le mot de passe est partagé. Sur une instance en service, il ouvrirait des
// accès et polluerait le catalogue vu par les lecteurs. Seules les cibles
// locales sont admises ; forcer exige un acte délibéré (SEED_FORCE=1).
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API) && process.env.SEED_FORCE !== '1') {
  console.error(`✖ Cible non locale (${API}).`);
  console.error('  Ce seed crée une école de démonstration avec des comptes partagés.');
  console.error('  Sur une installation réelle, relancez avec SEED_FORCE=1 en connaissance de cause.');
  process.exit(2);
}

// Mot de passe des comptes de démonstration. TIRÉ AU HASARD par défaut et
// affiché une fois en fin d'exécution : un mot de passe écrit dans le dépôt
// est un mot de passe publié — donc un compte ouvert sur toute installation
// où ce seed aurait été lancé. Surchargeable (SEED_PASSWORD) pour retrouver
// un jeu de comptes stable entre deux exécutions de développement.
const PASSWORD =
  process.env.SEED_PASSWORD ??
  `Gafeso-${randomBytes(9).toString('base64url')}!1`;

const log = (msg) => console.log(`  • ${msg}`);

// ── 1. Provisioning de l'école (via l'API admin) ──────────────
async function provision() {
  const res = await fetch(`${API}/admin/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-api-key': ADMIN_KEY },
    body: JSON.stringify({ name: SCHOOL, slug: SLUG, domain: 'localhost' }),
  });
  if (res.status === 201) log('école provisionnée');
  else if (res.status === 409) log('école déjà provisionnée');
  else throw new Error(`provisioning: HTTP ${res.status} ${await res.text()}`);

  // Propage d'éventuelles nouvelles tables aux écoles existantes.
  await fetch(`${API}/admin/tenants/${SLUG}/sync-schema`, {
    method: 'POST',
    headers: { 'x-admin-api-key': ADMIN_KEY },
  });
  log('schéma synchronisé');
}

// ── Clients Prisma (public + schéma de l'école) ───────────────
function tenantUrl() {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema', `tenant_${SLUG}`);
  return url.toString();
}

// ── 2. Public : super-admin, nom, couleurs, domaines ─────
async function seedPublic(pub) {
  // Super-admin plateforme (login sur /admin/login)
  const saHash = await bcrypt.hash(PASSWORD, 10);
  await pub.superAdmin.upsert({
    where: { email: 'super@gafeso.local' },
    create: { email: 'super@gafeso.local', password: saHash, name: 'Super Admin' },
    update: {},
  });
  log('super-admin plateforme (super@gafeso.local)');

  const tenant = await pub.tenant.findUnique({ where: { slug: SLUG } });
  await pub.tenant.update({ where: { id: tenant.id }, data: { name: SCHOOL } });
  await pub.tenantSettings.update({
    where: { tenantId: tenant.id },
    data: { primaryColor: '#0E5D31', secondaryColor: '#C8102E' },
  });
  for (const domain of ['localhost', 'zinda.localhost']) {
    await pub.domain.upsert({
      where: { domain },
      create: { tenantId: tenant.id, domain, isPrimary: domain === 'localhost' },
      update: {},
    });
  }
  log('branding (nom, couleurs, domaines)');
}

// ── 3. École : comptes, classes, catalogue, prêts ─────────────
const STAFF = [
  { email: 'admin@exemple.bf', firstName: 'Rasmata', lastName: 'Nikiema', role: 'ADMIN' },
  { email: 'gestion@exemple.bf', firstName: 'Mariam', lastName: 'Kaboré', role: 'MANAGER' },
  { email: 'bib@exemple.bf', firstName: 'Salif', lastName: 'Ouédraogo', role: 'LIBRARIAN' },
];

const STUDENTS = [
  { matricule: 'ETU-2026-0001', email: 'awa@exemple.bf', firstName: 'Awa', lastName: 'Traoré', className: 'L1_DROIT' },
  { matricule: 'ETU-2026-0002', email: 'boubacar@exemple.bf', firstName: 'Boubacar', lastName: 'Diallo', className: 'M2_MEDECINE' },
];

const EXPECTED = [
  ...STUDENTS.map((s) => ({ ...s })),
  { matricule: 'ETU-2026-0003', email: 'fatou.sow@exemple.bf', firstName: 'Fatou', lastName: 'Sow', className: 'L1_DROIT' },
];

const CLASSES = [
  { name: 'L1_DROIT', label: 'Licence 1 Droit', level: 'L1' },
  { name: 'M2_MEDECINE', label: 'Master 2 Médecine', level: 'M2' },
  { name: 'L1_INFO', label: 'Licence 1 Informatique', level: 'L1' },
];

const RECORDS = [
  { title: 'Droit constitutionnel burkinabè', author: 'Traoré, Awa', category: 'droit', recordType: 'these', publishYear: 2023, isbn: '978-2-0001' },
  { title: 'Précis de droit foncier rural', author: 'Ouédraogo, Salif', category: 'droit', recordType: 'memoire', publishYear: 2021 },
  { title: 'Anatomie générale', author: 'Kaboré, Mariam', category: 'medecine', recordType: 'ouvrage', publishYear: 2022 },
  { title: 'Informatique pour tous', author: 'Sawadogo, Issa', category: 'informatique', recordType: 'ouvrage', publishYear: 2020 },
  { title: 'Algorithmique avancée', author: 'Zongo, Pauline', category: 'informatique', recordType: 'ouvrage', publishYear: 2021 },
  { title: 'Histoire des empires du Sahel', author: 'Ki-Zerbo, Joseph', category: 'histoire', recordType: 'publication', publishYear: 2019 },
  { title: 'Microéconomie appliquée', author: 'Nikiema, Rasmata', category: 'economie', recordType: 'memoire', publishYear: 2022 },
  { title: 'Grammaire mooré-français', author: 'Ouoba, Benjamin', category: 'langues', recordType: 'memoire', publishYear: 2018 },
  { title: 'Introduction à la philosophie africaine', author: 'Bidima, Jean-Godefroy', category: 'philosophie', recordType: 'these', publishYear: 2020 },
  { title: 'Chimie générale — 1er cycle', author: 'Compaoré, Adama', category: 'sciences', recordType: 'ouvrage', publishYear: 2023 },
  { title: 'Arts plastiques du Burkina', author: 'Sanou, Fatoumata', category: 'arts', recordType: 'publication', publishYear: 2021 },
  { title: 'Anthologie de la littérature burkinabè', author: 'Sanogo, Alain', category: 'litterature', recordType: 'ouvrage', publishYear: 2017 },
];

async function seedTenant(db) {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Personnel (mot de passe défini pour la démo)
  //
  // `password` FIGURE AUSSI DANS `update`, et ce n'est pas un détail. Sans lui,
  // relancer le seed sur une base où le tenant existe déjà laissait les comptes
  // avec leur ANCIEN mot de passe, pendant que le script — et
  // gafeso-mobile/scripts/e2e-env.sh après lui — annonçaient fièrement la
  // nouvelle valeur. L'e2e mobile échouait alors sur « Identifiants
  // incorrects. », ce qui accuse l'application quand la cause est une fixture
  // périmée. Un seed de démonstration doit être AUTORITAIRE sur ses propres
  // comptes, sinon il n'est pas reproductible et le message qu'il affiche ment.
  for (const s of STAFF) {
    await db.user.upsert({
      where: { email: s.email },
      create: { ...s, password: hash, status: 'ACTIVE', activatedAt: new Date() },
      update: { role: s.role, status: 'ACTIVE', password: hash },
    });
  }
  // Étudiants actifs (clé sur le matricule, identifiant stable de l'étudiant)
  for (const s of STUDENTS) {
    await db.user.upsert({
      where: { matricule: s.matricule },
      create: {
        email: s.email, matricule: s.matricule, firstName: s.firstName,
        lastName: s.lastName, className: s.className, password: hash,
        role: 'STUDENT', status: 'ACTIVE', activatedAt: new Date(),
      },
      update: {
        email: s.email, firstName: s.firstName, lastName: s.lastName,
        className: s.className, status: 'ACTIVE', password: hash,
      },
    });
  }
  log(`${STAFF.length} comptes personnel + ${STUDENTS.length} étudiants`);

  // Liste des étudiants attendus (activation auto)
  for (const e of EXPECTED) {
    await db.expectedStudent.upsert({
      where: { matricule: e.matricule },
      create: { ...e },
      update: { email: e.email, className: e.className },
    });
  }
  log(`${EXPECTED.length} étudiants attendus`);

  // Classes
  for (const c of CLASSES) {
    await db.schoolClass.upsert({ where: { name: c.name }, create: c, update: c });
  }
  log(`${CLASSES.length} classes`);

  // Catalogue (notices) — clé naturelle : titre
  for (const r of RECORDS) {
    const existing = await db.biblioRecord.findFirst({ where: { title: r.title } });
    if (existing) {
      await db.biblioRecord.update({ where: { id: existing.id }, data: { ...r, marcData: {} } });
    } else {
      await db.biblioRecord.create({ data: { ...r, language: 'fr', marcData: {} } });
    }
  }
  log(`${RECORDS.length} notices`);

  // Exemplaires sur la première notice « droit »
  const droit = await db.biblioRecord.findFirst({ where: { title: RECORDS[0].title } });
  for (const barcode of ['BIB-000123', 'BIB-000124']) {
    await db.item.upsert({
      where: { barcode },
      create: { recordId: droit.id, barcode, itemType: 'livre', callNumber: '342.5 TRA', location: 'Salle de lecture' },
      update: {},
    });
  }
  log('2 exemplaires (notice droit)');

  // Règle de circulation : étudiant × livre = 7 j, 50 FCFA/j
  await db.circulationRule.upsert({
    where: { patronCategory_itemType: { patronCategory: 'etudiant', itemType: 'livre' } },
    create: { patronCategory: 'etudiant', itemType: 'livre', loanPeriodDays: 7, maxRenewals: 1, maxCheckouts: 3, finePerDay: 50 },
    update: {},
  });
  log('règle de prêt (étudiant × livre, 50 FCFA/j)');

  // Adhérents liés aux étudiants
  const awa = await db.user.findUnique({ where: { email: 'awa@exemple.bf' } });
  const bouba = await db.user.findUnique({ where: { email: 'boubacar@exemple.bf' } });
  const patrons = [
    { barcode: 'P-2026-0001', userId: awa.id },
    { barcode: 'P-2026-0002', userId: bouba.id },
  ];
  for (const p of patrons) {
    await db.patron.upsert({
      where: { barcode: p.barcode },
      create: { barcode: p.barcode, userId: p.userId, category: 'etudiant' },
      update: {},
    });
  }
  log(`${patrons.length} adhérents`);
}

// ── 4. Réindexation Meilisearch (via l'API) ───────────────────
async function reindex() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Host: 'localhost' },
    body: JSON.stringify({ email: 'bib@exemple.bf', password: PASSWORD }),
  });
  if (!login.ok) {
    log('réindexation ignorée (login bibliothécaire indisponible)');
    return;
  }
  const { accessToken } = await login.json();
  await fetch(`${API}/cataloging/reindex`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Host: 'localhost' },
  });
  log('catalogue réindexé (Meilisearch)');
}

// ── Orchestration ─────────────────────────────────────────────
async function main() {
  console.log('Seed Gafeso — Université d’Exemple\n');
  await provision();

  const pub = new PrismaClient();
  const db = new PrismaClient({ datasources: { db: { url: tenantUrl() } } });
  try {
    await seedPublic(pub);
    await seedTenant(db);
  } finally {
    await pub.$disconnect();
    await db.$disconnect();
  }

  await reindex();
  console.log(`\n✔ Démo prête. Mot de passe de TOUS les comptes : ${PASSWORD}`);
  console.log('  (tiré au hasard — fixez-le avec SEED_PASSWORD pour le garder d’une fois sur l’autre)');
  console.log('  Comptes :');
  console.log('   admin@exemple.bf · gestion@exemple.bf · bib@exemple.bf · awa@exemple.bf');
}

main().catch((err) => {
  console.error('\n✖ Seed échoué :', err.message);
  process.exit(1);
});
