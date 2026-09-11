// Propage le schéma du gabarit `public` vers une école DÉJÀ provisionnée.
//
// POURQUOI CE SCRIPT EXISTE. Les tables d'une école sont clonées au
// provisioning par `CREATE TABLE ... (LIKE public.t INCLUDING ALL)`, qui ne
// copie qu'à la CRÉATION. Une migration qui ajoute une colonne à une table
// tenant est donc vraie sur le gabarit et FAUSSE sur toutes les écoles
// existantes jusqu'à ce que cette synchronisation soit rejouée.
//
// DEPLOY.md prescrit l'opération depuis longtemps ; la réindexation avait son
// script, celle-ci non — elle se faisait donc à la main, ou pas du tout.
//
// Usage (depuis la racine, l'API doit tourner) :
//   node scripts/sync-schema.mjs <slug>
// En production :
//   docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
//     exec api node scripts/sync-schema.mjs <slug>
//
// Idempotent : la route rejoue la DDL en ignorant l'existant.

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
const SLUG = process.argv[2];

if (!SLUG) {
  console.error('Usage : node scripts/sync-schema.mjs <slug>');
  process.exit(1);
}

async function main() {
  const res = await fetch(`${API}/admin/tenants/${SLUG}/sync-schema`, {
    method: 'POST',
    headers: { 'x-admin-api-key': ADMIN_KEY },
  });
  if (!res.ok) {
    throw new Error(`synchronisation : HTTP ${res.status} ${await res.text()}`);
  }
  console.log(`✔ Schéma de "${SLUG}" synchronisé avec le gabarit public.`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

main().catch((err) => {
  console.error('\n✖ Synchronisation échouée :', err.message);
  process.exit(1);
});
