// Provisioning PRODUCTION — première école réelle sur ce serveur.
//
// Contrairement à scripts/seed-demo.mjs (démo de développement, mots de
// passe partagé, tiré au hasard), ce script est fait pour un
// premier démarrage en production réelle :
//   - le tenant est créé avec le VRAI domaine public (APP_URL) ;
//   - le super-admin plateforme reçoit un mot de passe aléatoire fort,
//     affiché UNE SEULE FOIS dans la sortie (jamais stocké en clair, jamais
//     réaffiché — à noter immédiatement) ;
//   - le compte admin de l'école ne reçoit PAS de mot de passe : comme pour
//     toute création de compte du personnel (voir
//     AccountsService.createStaff), un lien de définition de mot de passe à
//     usage unique (24h) est généré et affiché — à transmettre à
//     l'administrateur par un canal sécurisé (SMTP réel s'il est configuré,
//     sinon en main propre) ;
//   - quelques données de démonstration présentables sont ajoutées (classes,
//     une collection numérique, quelques notices) pour que l'école ne
//     démarre pas sur un catalogue vide ;
//   - les notices ajoutées sont indexées dans Meilisearch (sinon l'OPAC et
//     la page constellation démarreraient sur un index vide/absent).
//
// Idempotent : rejouable sans écraser un mot de passe déjà défini par un
// opérateur — si le super-admin ou l'admin existe déjà, il est laissé
// inchangé (aucun nouveau mot de passe/lien n'est généré).
//
// Prérequis : l'API doit tourner, à l'intérieur du conteneur `api` en
// production (DATABASE_URL/ADMIN_API_KEY/APP_URL déjà dans l'environnement
// du conteneur — voir docker-compose.prod.yml et DEPLOY.md) :
//   docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
//     exec api node scripts/provision-production.mjs
//
// Variables optionnelles pour personnaliser l'école/les comptes (sinon
// dérivées du domaine dans APP_URL) : PROVISION_SLUG, PROVISION_SCHOOL_NAME,
// PROVISION_SUPERADMIN_EMAIL, PROVISION_ADMIN_EMAIL,
// PROVISION_ADMIN_FIRSTNAME, PROVISION_ADMIN_LASTNAME.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { loadEnvIfPresent } from './lib/load-env.mjs';

loadEnvIfPresent();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement ${name} requise (voir DEPLOY.md).`);
  }
  return value;
}

const API = process.env.SEED_API_URL ?? 'http://localhost:4000';
const ADMIN_KEY = requireEnv('ADMIN_API_KEY');
const APP_URL = requireEnv('APP_URL'); // ex. https://bibliotheque.exemple.bf

// hostname (SANS le port) : la résolution multi-tenant se fait sur le Host sans
// port (TenancyService.resolveByHost) — un domaine « localhost:8080 » ne
// résoudrait jamais. En prod le domaine n'a pas de port → aucune différence.
const DOMAIN = new URL(APP_URL).hostname;
const SLUG = process.env.PROVISION_SLUG ?? 'bibliotheque';
const SCHOOL = process.env.PROVISION_SCHOOL_NAME ?? 'Bibliothèque';
// Domaine des adresses générées. `localhost` — ou tout hôte SANS point — n'est
// pas un domaine d'email valide : le DTO de connexion (@IsEmail) le refuse.
// Le compte administrateur était donc créé puis REJETÉ à la connexion, avec
// « email must be an email » — impossible d'entrer dans une install d'essai.
// On bascule sur un domaine de repli valide quand l'hôte n'en est pas un.
const MAIL_DOMAIN = DOMAIN.includes('.') ? DOMAIN : 'gafeso.local';
const SUPERADMIN_EMAIL = process.env.PROVISION_SUPERADMIN_EMAIL ?? `superadmin@${MAIL_DOMAIN}`;
const ADMIN_EMAIL = process.env.PROVISION_ADMIN_EMAIL ?? `admin@${MAIL_DOMAIN}`;
const ADMIN_FIRSTNAME = process.env.PROVISION_ADMIN_FIRSTNAME ?? 'Administrateur';
const ADMIN_LASTNAME = process.env.PROVISION_ADMIN_LASTNAME ?? SCHOOL;
// Couleur primaire de l'école (hex #RRGGBB) — optionnelle, posée par install.sh.
const PRIMARY_COLOR = process.env.PROVISION_PRIMARY_COLOR;

// Mêmes constantes que AccountsService (apps/api/src/accounts/accounts.service.ts)
// — même politique de mot de passe que le reste de l'application.
const TOKEN_TTL_HOURS = 24;
const TOKEN_BYTES = 32;
const BCRYPT_ROUNDS = 10;

const log = (msg) => console.log(`  • ${msg}`);

/** Mot de passe aléatoire fort — jamais réutilisé, affiché une seule fois. */
function generateStrongPassword() {
  return randomBytes(18).toString('base64url'); // ~24 caractères
}

// ── 1. Provisioning du tenant (réutilise la route /admin/tenants) ────
async function provisionTenant() {
  const res = await fetch(`${API}/admin/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-api-key': ADMIN_KEY },
    body: JSON.stringify({ name: SCHOOL, slug: SLUG, domain: DOMAIN }),
  });
  if (res.status === 201) log(`école provisionnée (${DOMAIN})`);
  else if (res.status === 409) log('école déjà provisionnée');
  else throw new Error(`provisioning: HTTP ${res.status} ${await res.text()}`);

  // Propage d'éventuelles nouvelles tables si l'école existait déjà.
  await fetch(`${API}/admin/tenants/${SLUG}/sync-schema`, {
    method: 'POST',
    headers: { 'x-admin-api-key': ADMIN_KEY },
  });
  log('schéma synchronisé');
}

function tenantUrl() {
  const url = new URL(requireEnv('DATABASE_URL'));
  url.searchParams.set('schema', `tenant_${SLUG}`);
  return url.toString();
}

// ── 2. Super-admin plateforme (créé une seule fois) ───────────────────
async function ensureSuperAdmin(pub) {
  const existing = await pub.superAdmin.findUnique({ where: { email: SUPERADMIN_EMAIL } });
  if (existing) {
    log(`super-admin déjà existant (${SUPERADMIN_EMAIL}) — mot de passe inchangé`);
    return;
  }
  const password = generateStrongPassword();
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await pub.superAdmin.create({
    data: { email: SUPERADMIN_EMAIL, password: hash, name: 'Super Admin' },
  });
  printOnce('Super-admin plateforme (POST /admin/login)', SUPERADMIN_EMAIL, [
    `mot de passe : ${password}`,
  ]);
}

// ── 3. Branding minimal (nom, couleurs déjà par défaut sinon personnalisées) ──
async function applyBranding(pub) {
  const tenant = await pub.tenant.findUnique({ where: { slug: SLUG } });
  await pub.tenant.update({ where: { id: tenant.id }, data: { name: SCHOOL } });
  if (PRIMARY_COLOR && /^#[0-9a-fA-F]{6}$/.test(PRIMARY_COLOR)) {
    // La ligne tenant_settings existe déjà (créée au provisioning) — upsert par
    // sécurité si une école préexistante n'en avait pas.
    await pub.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, primaryColor: PRIMARY_COLOR },
      update: { primaryColor: PRIMARY_COLOR },
    });
    log(`couleur primaire appliquée (${PRIMARY_COLOR})`);
  }
  return tenant;
}

// ── 4. Compte admin de l'école — lien de définition de mot de passe ──
async function ensureSchoolAdmin(db) {
  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    log(`compte admin déjà existant (${ADMIN_EMAIL}) — inchangé`);
    return;
  }
  const setPasswordUrl = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: ADMIN_EMAIL,
        firstName: ADMIN_FIRSTNAME,
        lastName: ADMIN_LASTNAME,
        role: 'ADMIN',
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);
    await tx.passwordToken.create({ data: { userId: user.id, token, expiresAt } });
    return `${APP_URL}/definir-mot-de-passe?token=${token}`;
  });
  printOnce('Administrateur école — lien à usage unique (24h)', ADMIN_EMAIL, [
    `lien : ${setPasswordUrl}`,
  ]);
}

function printOnce(label, email, lines) {
  console.log(`\n  ⚠ ${label} — À NOTER MAINTENANT (non réaffiché) :`);
  console.log(`    email : ${email}`);
  for (const line of lines) console.log(`    ${line}`);
}

// ── 5. Données de démonstration présentables ───────────────────────
const CLASSES = [
  { name: 'L1_DROIT', label: 'Licence 1 Droit', level: 'L1' },
  { name: 'M2_MEDECINE', label: 'Master 2 Médecine', level: 'M2' },
  { name: 'L1_INFO', label: 'Licence 1 Informatique', level: 'L1' },
];

const RECORDS = [
  { title: 'Droit constitutionnel burkinabè', author: 'Traoré, Awa', category: 'droit', recordType: 'these', publishYear: 2023 },
  { title: 'Anatomie générale', author: 'Kaboré, Mariam', category: 'medecine', recordType: 'ouvrage', publishYear: 2022 },
  { title: 'Informatique pour tous', author: 'Sawadogo, Issa', category: 'informatique', recordType: 'ouvrage', publishYear: 2020 },
  { title: 'Histoire des empires du Sahel', author: 'Ki-Zerbo, Joseph', category: 'histoire', recordType: 'publication', publishYear: 2019 },
];

async function seedDemoData(pub, db, tenant) {
  for (const c of CLASSES) {
    await db.schoolClass.upsert({ where: { name: c.name }, create: c, update: c });
  }
  log(`${CLASSES.length} classes`);

  const records = [];
  for (const r of RECORDS) {
    let record = await db.biblioRecord.findFirst({ where: { title: r.title } });
    if (!record) {
      record = await db.biblioRecord.create({ data: { ...r, language: 'fr', marcData: {} } });
    }
    records.push(record);
  }
  log(`${RECORDS.length} notices`);

  // Les collections vivent dans le schéma `public` (partagé), filtrées par
  // tenantId — jamais dans le schéma tenant_<slug> (voir schema.prisma,
  // modèle Collection).
  // On rattache les notices de démonstration à la collection SOCLE, celle que
  // provisionTenant crée avec sa règle d'accès. Auparavant ce script créait sa
  // propre collection « Bibliothèque numérique » SANS aucune règle : ses
  // notices apparaissaient au catalogue mais AUCUN étudiant ne pouvait les
  // ouvrir. Vérifié en recette — accès refusé avec le code NOT_CONFIGURED.
  // Des données de démonstration inaccessibles donnent exactement l'impression
  // que le produit ne marche pas.
  let collection = await pub.collection.findFirst({
    where: { tenantId: tenant.id, isDefault: true },
  });
  if (!collection) {
    // Repli : école provisionnée avant l'introduction du socle. On crée la
    // collection ET sa règle, pour ne pas reproduire le défaut.
    collection = await pub.collection.create({
      data: {
        name: 'Bibliothèque numérique',
        description: 'Sélection de notices pour la mise en route.',
        type: 'INTERNAL',
        tenantId: tenant.id,
        accessRules: {
          create: [{ tenantId: tenant.id, className: null, subscriptionTier: null }],
        },
      },
    });
  }
  for (const record of records) {
    await pub.collectionTitle.upsert({
      where: { collectionId_recordId: { collectionId: collection.id, recordId: record.id } },
      create: { collectionId: collection.id, recordId: record.id },
      update: {},
    });
  }
  log(`${records.length} notices rattachées à « ${collection.name} » (accessibles immédiatement)`);
}

// ── 6. Indexation Meilisearch ──────────────────────────────────────
// Les notices insérées directement en base (ci-dessus) ne sont PAS
// indexées automatiquement — sans cet appel, l'OPAC/la constellation
// démarreraient sur un index vide (voir scripts/reindex.mjs).
async function reindex() {
  const res = await fetch(`${API}/admin/tenants/${SLUG}/reindex`, {
    method: 'POST',
    headers: { 'x-admin-api-key': ADMIN_KEY },
  });
  if (!res.ok) throw new Error(`réindexation : HTTP ${res.status} ${await res.text()}`);
  const { indexed } = await res.json();
  log(`${indexed} notice(s) indexée(s) dans Meilisearch`);
}

// ── Orchestration ────────────────────────────────────────────────────
async function main() {
  console.log(`Provisioning PRODUCTION — ${SCHOOL} (${DOMAIN})\n`);
  await provisionTenant();

  const pub = new PrismaClient();
  const db = new PrismaClient({ datasources: { db: { url: tenantUrl() } } });
  try {
    await ensureSuperAdmin(pub);
    const tenant = await applyBranding(pub);
    await ensureSchoolAdmin(db);
    await seedDemoData(pub, db, tenant);
  } finally {
    await pub.$disconnect();
    await db.$disconnect();
  }
  await reindex();

  console.log('\n✔ École de production provisionnée.');
}

main().catch((err) => {
  console.error('\n✖ Provisioning échoué :', err.message);
  process.exit(1);
});
