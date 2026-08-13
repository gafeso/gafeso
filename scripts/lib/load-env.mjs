// Charge un fichier .env s'il existe (développement). En production, les
// variables sont déjà injectées par Docker Compose (docker-compose.prod.yml,
// bloc `environment:` du service `api`) — il n'y a alors aucun fichier .env
// dans le conteneur, ce chargement est un no-op silencieux.
import { existsSync, readFileSync } from 'node:fs';

export function loadEnvIfPresent(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
