// Réindexe le catalogue d'une école dans Meilisearch depuis PostgreSQL
// (source de vérité). Nécessaire :
//   - après un provisioning (les notices insérées en base ne sont PAS
//     indexées automatiquement — provision-production.mjs le fait déjà pour
//     l'école qu'il crée, ce script sert pour toute école existante) ;
//   - après une perte de l'index (rollback Docker, volume `meili_data` vidé
//     — l'index n'est pas dans le dump PostgreSQL, il faut le reconstruire).
//
// Usage (depuis la racine, l'API doit tourner) :
//   node scripts/reindex.mjs <slug>
//   npm run reindex -- <slug>
// En production (conteneur, pas de fichier .env) :
//   docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
//     exec api node scripts/reindex.mjs <slug>

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
  console.error('Usage : node scripts/reindex.mjs <slug>');
  process.exit(1);
}

async function main() {
  const res = await fetch(`${API}/admin/tenants/${SLUG}/reindex`, {
    method: 'POST',
    headers: { 'x-admin-api-key': ADMIN_KEY },
  });
  if (!res.ok) {
    throw new Error(`réindexation : HTTP ${res.status} ${await res.text()}`);
  }
  const { indexed } = await res.json();
  console.log(`✔ ${indexed} notice(s) réindexée(s) pour "${SLUG}".`);
}

main().catch((err) => {
  console.error('\n✖ Réindexation échouée :', err.message);
  process.exit(1);
});
