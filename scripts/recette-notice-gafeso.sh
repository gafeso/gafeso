#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# Recette — lot 1 « notice Gafeso » : le MARC devient facultatif.
#
# Migration : apps/api/prisma/migrations/20260907120000_notice_gafeso_marc_facultatif
# Architecture : docs/architecture-notice.md
#
# Trois affirmations, vérifiées UNE PAR UNE sur une base neuve :
#   1. `marc_data` accepte NULL           — une notice sans source MARC existe ;
#   2. `marc_format` accepte 'GAFESO'     — elle a un format natif qui n'est pas du MARC ;
#   3. `profile` existe, défaut « bibliographique ».
#
# CONTRÔLE NÉGATIF — intégré, pas documenté : le script déploie AUSSI
# l'historique SANS la migration et vérifie que CHACUNE des trois affirmations
# y échoue. Une recette qui passerait des deux côtés ne prouverait rien.
#
#   ./scripts/recette-notice-gafeso.sh
#
# Prérequis : l'infra de dev tourne (docker/docker-compose.yml) et .env porte
# DATABASE_URL. Deux bases jetables sont créées puis supprimées :
# `recette_notice_apres` et `recette_notice_avant`. Aucune base de travail
# n'est touchée.
# ═════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$RACINE/apps/api"
MIGRATION="20260907120000_notice_gafeso_marc_facultatif"
CONTENEUR_DB="${CONTENEUR_DB:-bibliocloud-db-1}"

vert() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
rouge() { printf '  \033[31m✖ %s\033[0m\n' "$*"; }
ECHECS=0
ko() { rouge "$*"; ECHECS=$((ECHECS + 1)); }

DB_URL="$(grep -E '^DATABASE_URL=' "$RACINE/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')"
[ -n "$DB_URL" ] || { rouge "DATABASE_URL absent de .env"; exit 1; }
UTILISATEUR="$(printf '%s' "$DB_URL" | sed -E 's#^postgresql://([^:]+):.*#\1#')"

psql_base() { docker exec -i "$CONTENEUR_DB" psql -U "$UTILISATEUR" -d "$1" -v ON_ERROR_STOP=1 -qtA; }
url_pour() { printf '%s' "$DB_URL" | sed -E "s#/[^/?]+\?#/$1?#"; }

recreer() {
  docker exec "$CONTENEUR_DB" psql -U "$UTILISATEUR" -d postgres \
    -c "DROP DATABASE IF EXISTS $1;" -c "CREATE DATABASE $1;" >/dev/null 2>&1
}

# Une notice saisie dans Gafeso : aucune métadonnée MARC, format natif GAFESO.
# `updated_at` est explicite (Prisma le pose côté client, pas de défaut SQL).
INSERTION_COMPLETE="INSERT INTO biblio_records (id, record_type, title, marc_format, updated_at)
  VALUES (gen_random_uuid(), 'Thèse', 'Notice sans MARC', 'GAFESO', now());"

echo
echo "── 1/2 · Avec la migration (base recette_notice_apres)"
recreer recette_notice_apres
(cd "$API" && DATABASE_URL="$(url_pour recette_notice_apres)" npx prisma migrate deploy >/dev/null 2>&1) \
  || ko "le déploiement des migrations a échoué"

if psql_base recette_notice_apres <<<"$INSERTION_COMPLETE" >/dev/null 2>&1; then
  vert "une notice sans MARC, en format natif GAFESO, est acceptée"
else
  ko "l'insertion d'une notice sans MARC est refusée — la migration n'a pas pris"
fi

PROFIL="$(psql_base recette_notice_apres <<<"SELECT profile FROM biblio_records LIMIT 1;" 2>/dev/null)"
[ "$PROFIL" = "bibliographique" ] \
  && vert "profil par défaut : bibliographique" \
  || ko "profil attendu « bibliographique », obtenu « ${PROFIL:-<rien>} »"

MARC_NUL="$(psql_base recette_notice_apres <<<"SELECT marc_data IS NULL FROM biblio_records LIMIT 1;" 2>/dev/null)"
[ "$MARC_NUL" = "t" ] \
  && vert "marc_data reste NULL — aucune notice MARC vide fabriquée" \
  || ko "marc_data n'est pas NULL"

echo
echo "── 2/2 · CONTRÔLE NÉGATIF — sans la migration (base recette_notice_avant)"
recreer recette_notice_avant
mv "$API/prisma/migrations/$MIGRATION" "/tmp/$MIGRATION.recette" || { rouge "migration introuvable"; exit 1; }
# Quoi qu'il arrive ensuite, la migration revient à sa place.
trap 'mv "/tmp/'"$MIGRATION"'.recette" "'"$API"'/prisma/migrations/'"$MIGRATION"'" 2>/dev/null' EXIT
(cd "$API" && DATABASE_URL="$(url_pour recette_notice_avant)" npx prisma migrate deploy >/dev/null 2>&1) \
  || ko "le déploiement de l'historique antérieur a échoué"

echec_attendu() { # <libellé> <sql>
  if psql_base recette_notice_avant <<<"$2" >/dev/null 2>&1; then
    ko "$1 — la recette passe SANS la migration : elle ne prouve rien"
  else
    vert "$1"
  fi
}

echec_attendu "sans le lot, marc_data NULL est refusé" \
  "INSERT INTO biblio_records (id, record_type, title, marc_format, updated_at)
   VALUES (gen_random_uuid(), 'Thèse', 'x', 'UNIMARC', now());"
echec_attendu "sans le lot, marc_format 'GAFESO' est refusé" \
  "INSERT INTO biblio_records (id, record_type, title, marc_data, marc_format, updated_at)
   VALUES (gen_random_uuid(), 'Thèse', 'x', '{}'::jsonb, 'GAFESO', now());"
echec_attendu "sans le lot, la colonne profile n'existe pas" \
  "SELECT profile FROM biblio_records;"

docker exec "$CONTENEUR_DB" psql -U "$UTILISATEUR" -d postgres \
  -c "DROP DATABASE IF EXISTS recette_notice_apres;" \
  -c "DROP DATABASE IF EXISTS recette_notice_avant;" >/dev/null 2>&1

echo
if [ "$ECHECS" -eq 0 ]; then
  printf '\033[32mRecette « notice Gafeso » : tout est vert.\033[0m\n\n'
  exit 0
fi
printf '\033[31mRecette « notice Gafeso » : %d échec(s).\033[0m\n\n' "$ECHECS"
exit 1
