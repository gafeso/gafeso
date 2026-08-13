#!/bin/sh
# ─────────────────────────────────────────────────────────────
# Point d'entrée de l'image de production API.
# Applique les migrations Prisma en attente (idempotent — ne fait rien si
# la base est déjà à jour) puis démarre le serveur.
# ─────────────────────────────────────────────────────────────
set -e

echo "[entrypoint] Application des migrations Prisma…"
npx --no-install prisma migrate deploy --schema=apps/api/prisma/schema.prisma

echo "[entrypoint] Démarrage de l'API…"
exec "$@"
