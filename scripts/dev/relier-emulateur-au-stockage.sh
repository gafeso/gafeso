#!/usr/bin/env bash
# Rend le stockage objet de développement JOIGNABLE depuis un émulateur
# Android, sans toucher au code ni à .env.
#
# ⚠ POURQUOI CE SCRIPT EXISTE, ET POURQUOI ON NE PEUT PAS L'OUBLIER UNE FOIS :
#
# L'URL signée de lecture (storage.service.ts) porte l'hôte MINIO_ENDPOINT —
# "localhost" en développement, et c'est VOULU : la signature AWS SigV4 porte
# sur le Host, donc le faire pointer directement vers "10.0.2.2" (l'alias
# habituel pour joindre l'hôte depuis l'émulateur) romprait la signature —
# exactement le défaut déjà mesuré et documenté en production (voir le
# commentaire de rewriteToPublicOrigin). On garde donc "localhost" des deux
# côtés, et c'est `adb reverse` qui fait le pont : depuis l'émulateur,
# "localhost:9000" est alors RÉELLEMENT le MinIO de cette machine.
#
# ⚠ `adb reverse` NE SURVIT PAS à un redémarrage de l'émulateur — ce n'est pas
# un défaut de ce script, c'est une propriété d'adb. Le geste se refait à
# chaque session d'émulateur ; c'est pour ça qu'il est un script, pas une
# ligne qu'on se souvient d'avoir tapée une fois.
#
# Preuve que ce pont fonctionne réellement (pas supposée) : le 20/10/2026,
# une licence hors ligne réelle de tenant_zinda a été téléchargée par ce
# chemin EXACT depuis l'émulateur (requête HTTP brute via `adb shell nc`), et
# son SHA-256 était identique à celui obtenu directement depuis l'hôte.
# Zéro ligne de code modifiée : storage.service.ts, .env et MINIO_ENDPOINT
# sont restés tels quels.
set -euo pipefail

PORT="${MINIO_PORT:-9000}"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb est introuvable — installez les platform-tools Android." >&2
  exit 1
fi

if ! adb get-state >/dev/null 2>&1; then
  echo "Aucun émulateur/appareil adb connecté (adb devices est vide)." >&2
  exit 1
fi

adb reverse --remove "tcp:${PORT}" >/dev/null 2>&1 || true
adb reverse "tcp:${PORT}" "tcp:${PORT}"

echo "✓ localhost:${PORT} dans l'émulateur → MinIO de cet hôte (adb reverse, fixe)."
echo "  À refaire à chaque redémarrage de l'émulateur."
