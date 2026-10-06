#!/usr/bin/env bash
# CONTRÔLE D'AVANT-VOL : l'API démarrera-t-elle avec ce `.env.prod` ?
#
# ⚠ POURQUOI IL EXISTE. Depuis la V1, l'API REFUSE DE DÉMARRER si un secret de
# production porte une valeur d'exemple ou est trop court. C'est voulu — un
# `change_me` en production est un compte administrateur offert à qui lit notre
# dépôt. Mais sur une instance EN SERVICE, le refus se découvre au redémarrage,
# c'est-à-dire pendant l'indisponibilité.
#
# Ce script pose la question AVANT, et il la pose au MÊME code que l'API : il
# charge `dist/common/secrets-de-production.js` depuis l'image. Un contrôle qui
# recopierait la liste des seuils serait « deux sources qui s'accordent par
# coïncidence » — il dirait oui le jour où l'API dit non.
#
# ⚠ IL N'IMPRIME AUCUNE VALEUR : seulement le nom de la variable, sa longueur, et
# ce qu'un attaquant pourrait faire. Un contrôle de secrets qui imprime les
# secrets est un contrôle qu'on ne peut pas coller dans un ticket.
#
# Usage, depuis la racine du dépôt cloné, APRÈS le build de l'image :
#   scripts/verifier-secrets-de-production.sh [chemin-du-env] [fichier-compose]
set -euo pipefail
cd "$(dirname "$0")/.."

ENVF="${1:-.env.prod}"
COMPOSE="${2:-docker/docker-compose.prod.yml}"

[ -s "$ENVF" ] || { echo "REFUSÉ : « $ENVF » absent ou vide." >&2; exit 2; }

# ⚠ `--no-deps` : on ne démarre NI la base NI Meilisearch. On ne veut que
# l'environnement, et surtout pas réveiller des services pour un contrôle.
# ⚠ `--entrypoint node` : l'entrée normale applique les migrations puis démarre
# l'API — exactement ce qu'on cherche à ne PAS faire avant d'avoir répondu.
if ! docker compose --env-file "$ENVF" -f "$COMPOSE" \
     run --rm --no-deps --entrypoint node api -e '
const { refusDesSecrets } = require("/app/apps/api/dist/common/secrets-de-production");
const refus = refusDesSecrets((v) => process.env[v]);
if (refus.length === 0) {
  console.log("✓ Aucun refus — l’API démarrera avec ce .env.prod.");
  process.exit(0);
}
console.error("🔴 L’API REFUSERA DE DÉMARRER. " + refus.length + " secret(s) :");
for (const m of refus) console.error("   · " + m);
console.error("");
console.error("Procédure de rotation : voir DEPLOY.md, section « Rotation des secrets ».");
console.error("⚠ Si c est OFFLINE_CONTENT_KEK qui est refusee : MESUREZ d abord");
console.error("  combien de documents chiffres l instance porte (DEPLOY.md le dit).");
console.error("  ZERO document => la rotation est LIBRE. Sinon, elle est IMPOSSIBLE");
console.error("  sans perte : aucun script de reenveloppement n existe (backlog n 54).");
process.exit(1);
'; then
  echo "" >&2
  echo "⚠ Ne lancez pas « up -d » : l'API s'arrêterait au démarrage, et le" >&2
  echo "  conteneur boucherait en redémarrant." >&2
  exit 1
fi
