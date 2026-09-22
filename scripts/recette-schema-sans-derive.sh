#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# Recette — l'historique de migrations et le schéma Prisma disent la MÊME chose.
#
# `prisma migrate diff` entre l'historique et le modèle doit produire une
# migration VIDE. Tant qu'il produit du SQL, chaque `migrate diff` d'un futur
# changement embarque ces écarts en prime — c'est ainsi que la migration du lot
# « notice Gafeso » a failli emporter deux changements de comportement qui
# n'avaient rien à y faire.
#
#   ./scripts/recette-schema-sans-derive.sh
#
# CONTRÔLE NÉGATIF — intégré : les deux corrections sont retirées tour à tour, et
# la dérive DOIT réapparaître à chaque fois. Une recette qui passerait sans elles
# ne prouverait rien.
#
# Les deux écarts résorbés le 7 septembre 2026 :
#   1. `record_contributors.author_id` — sans `onDelete` explicite, Prisma déduit
#      SetNull, alors que l'historique, le rattrapage tenant et le commentaire du
#      modèle disent tous RESTRICT ;
#   2. l'index unique des licences hors-ligne — déployé en `..._idx`, attendu en
#      `..._key` par Prisma. On aligne le modèle sur le déployé (`map:`), jamais
#      l'inverse : renommer un index vivant désynchroniserait le rattrapage
#      tenant (buildUniqueIndexStatements).
#
# Prérequis : l'infra de dev tourne. Une base shadow JETABLE est créée puis
# supprimée — jamais la base de développement (voir DEPLOY.md).
# ═════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$RACINE/apps/api"
SCHEMA="$API/prisma/schema.prisma"
CONTENEUR_DB="${CONTENEUR_DB:-bibliocloud-db-1}"
SAUVEGARDE="$(mktemp)"
cp "$SCHEMA" "$SAUVEGARDE"
trap 'cp "$SAUVEGARDE" "$SCHEMA"; rm -f "$SAUVEGARDE"' EXIT

vert() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
rouge() { printf '  \033[31m✖ %s\033[0m\n' "$*"; }
ECHECS=0
ko() { rouge "$*"; ECHECS=$((ECHECS + 1)); }

DB_URL="$(grep -E '^DATABASE_URL=' "$RACINE/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')"
[ -n "$DB_URL" ] || { rouge "DATABASE_URL absent de .env"; exit 1; }
UTILISATEUR="$(printf '%s' "$DB_URL" | sed -E 's#^postgresql://([^:]+):.*#\1#')"
SHADOW="$(printf '%s' "$DB_URL" | sed -E 's#/[^/?]+\?#/recette_schema_shadow?#')"

docker exec "$CONTENEUR_DB" psql -U "$UTILISATEUR" -d postgres \
  -c "DROP DATABASE IF EXISTS recette_schema_shadow;" \
  -c "CREATE DATABASE recette_schema_shadow;" >/dev/null 2>&1

# Sortie du diff, débarrassée des lignes vides et du commentaire « migration vide ».
diff_sql() {
  (cd "$API" && npx prisma migrate diff \
    --from-migrations prisma/migrations \
    --to-schema-datamodel prisma/schema.prisma \
    --shadow-database-url "$SHADOW" --script 2>/dev/null) \
    | grep -vE '^\s*$|^-- This is an empty migration\.$'
}

echo
echo "── 1/2 · L'historique et le modèle sont d'accord"
SORTIE="$(diff_sql)"
if [ -z "$SORTIE" ]; then
  vert "migrate diff ne produit aucun SQL : aucune dérive"
else
  ko "dérive résiduelle :"
  printf '%s\n' "$SORTIE" | sed 's/^/      /'
fi

echo
echo "── 2/2 · CONTRÔLE NÉGATIF — chaque correction est nécessaire"
verifier_retrait() { # <libellé> <motif à retirer> <motif attendu dans le diff>
  cp "$SAUVEGARDE" "$SCHEMA"
  python3 - "$SCHEMA" "$2" <<'PY'
import sys
chemin, motif = sys.argv[1], sys.argv[2]
s = open(chemin, encoding='utf-8').read()
assert motif in s, f"motif absent du schéma : {motif}"
open(chemin, 'w', encoding='utf-8').write(s.replace(motif, ')', 1))
PY
  if diff_sql | grep -q "$3"; then
    vert "$1"
  else
    ko "$1 — la dérive NE réapparaît PAS : la recette ne prouve rien"
  fi
  cp "$SAUVEGARDE" "$SCHEMA"
}

verifier_retrait "sans onDelete explicite, la FK repasse en SET NULL" \
  ", onDelete: Restrict)" "SET NULL"
verifier_retrait "sans map:, Prisma veut renommer l'index unique déployé" \
  ', map: "offline_licenses_user_id_device_id_record_id_idx")' "RenameIndex"

docker exec "$CONTENEUR_DB" psql -U "$UTILISATEUR" -d postgres \
  -c "DROP DATABASE IF EXISTS recette_schema_shadow;" >/dev/null 2>&1

echo
if [ "$ECHECS" -eq 0 ]; then
  printf '\033[32mRecette « schéma sans dérive » : tout est vert.\033[0m\n\n'; exit 0
fi
printf '\033[31mRecette « schéma sans dérive » : %d échec(s).\033[0m\n\n' "$ECHECS"; exit 1
