#!/bin/sh
# ─────────────────────────────────────────────────────────────
# Point d'entrée de l'image de production API.
#
#   ① REFUSE les secrets d'exemple ou trop faibles — AVANT toute chose ;
#   ② applique les migrations Prisma en attente (idempotent) ;
#   ③ démarre le serveur.
# ─────────────────────────────────────────────────────────────
set -e

# ─────────────────────────────────────────────────────────────────────────────
# ① LES SECRETS, EN PREMIER — et ce n'était pas le cas jusqu'au 6 octobre 2026.
#
# `assertProductionSecrets` vit dans `main.ts`, donc APRÈS `prisma migrate
# deploy`. Conséquence mesurée par la recette du jour : un mot de passe de base
# faible ne produisait PAS le refus explicite, mais une boucle de
#
#     Error: P1000: Authentication failed against database server at `db`
#
# Prisma échouait d'abord, le conteneur redémarrait, et le message qui NOMME la
# variable et dit quoi faire n'était jamais atteint. L'opérateur voyait une
# panne d'authentification — vraie, et qui n'explique pas que c'est SA valeur
# qui est refusée par SON produit.
#
# ⚠ Et l'ordre a un second effet, plus important : une tentative de migration
# avec des identifiants refusés TOUCHE la base avant qu'on ait validé la
# configuration. Un contrôle de configuration passe avant tout accès.
#
# Le module est celui de l'API — pas une copie. Deux listes de seuils
# s'accorderaient par coïncidence jusqu'au jour où l'une change.
echo "[entrypoint] Contrôle des secrets de production…"
node -e '
const { refusDesSecrets } = require("/app/apps/api/dist/common/secrets-de-production");
const refus = refusDesSecrets((v) => process.env[v]);
if (refus.length === 0) process.exit(0);
console.error("");
console.error("🔴 REFUS DE DÉMARRER — " + refus.length + " secret(s) de production :");
for (const m of refus) console.error("   · " + m);
console.error("");
console.error("Corrigez .env.prod, puis relancez. Procédure : DEPLOY.md, « Rotation des secrets ».");
console.error("⚠ OFFLINE_CONTENT_KEK ne se tourne PAS sur une instance qui porte déjà");
console.error("  des documents chiffrés — mesurez d abord ce que l instance contient.");
console.error("");
process.exit(1);
'

echo "[entrypoint] Application des migrations Prisma…"
npx --no-install prisma migrate deploy --schema=apps/api/prisma/schema.prisma

echo "[entrypoint] Démarrage de l'API…"
exec "$@"
