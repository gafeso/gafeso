#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# Recette — la procédure « Migrations Prisma » de DEPLOY.md ne doit pas
# effacer la base de développement.
#
# `prisma migrate diff --shadow-database-url` RÉINITIALISE la base indiquée :
# il y fait table rase avant de rejouer l'historique de migrations. DEPLOY.md
# donnait `$DATABASE_URL` en exemple en affirmant qu'« aucune donnée n'y est
# modifiée » : suivre cette ligne effaçait la base de dev.
#
#   ./scripts/recette-shadow-jetable.sh
#
# CONTRÔLE NÉGATIF — intégré : la même manipulation est rejouée avec l'ANCIENNE
# ligne (shadow = la base de travail elle-même) et doit DÉTRUIRE le témoin. Une
# recette qui passerait des deux côtés ne prouverait rien.
#
# Aucune base réelle n'est touchée : le rôle de « base de développement » est
# tenu par une base jetable (`recette_faux_dev`), et la base shadow dédiée est
# `recette_shadow`. Les deux sont supprimées en fin de course.
# ═════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$RACINE/apps/api"
CONTENEUR_DB="${CONTENEUR_DB:-bibliocloud-db-1}"

vert() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
rouge() { printf '  \033[31m✖ %s\033[0m\n' "$*"; }
ECHECS=0
ko() { rouge "$*"; ECHECS=$((ECHECS + 1)); }

DB_URL="$(grep -E '^DATABASE_URL=' "$RACINE/.env" | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')"
[ -n "$DB_URL" ] || { rouge "DATABASE_URL absent de .env"; exit 1; }
UTILISATEUR="$(printf '%s' "$DB_URL" | sed -E 's#^postgresql://([^:]+):.*#\1#')"
url_pour() { printf '%s' "$DB_URL" | sed -E "s#/[^/?]+\?#/$1?#"; }
psql_adm() { docker exec "$CONTENEUR_DB" psql -U "$UTILISATEUR" -d postgres "$@"; }

# Une « base de développement » jetable, avec un témoin reconnaissable.
poser_temoin() {
  psql_adm -c "DROP DATABASE IF EXISTS recette_faux_dev;" -c "CREATE DATABASE recette_faux_dev;" >/dev/null 2>&1
  docker exec "$CONTENEUR_DB" psql -U "$UTILISATEUR" -d recette_faux_dev -q \
    -c "CREATE TABLE temoin (valeur int); INSERT INTO temoin VALUES (42);" >/dev/null 2>&1
}
temoin_survit() {
  [ "$(docker exec "$CONTENEUR_DB" psql -U "$UTILISATEUR" -d recette_faux_dev -tAc \
       "SELECT valeur FROM temoin;" 2>/dev/null)" = "42" ]
}

diff_avec_shadow() { # <url shadow>
  (cd "$API" && npx prisma migrate diff \
      --from-migrations prisma/migrations \
      --to-schema-datamodel prisma/schema.prisma \
      --shadow-database-url "$1" --script) >/dev/null 2>&1
}

echo
echo "── 1/2 · Procédure corrigée : shadow = base dédiée jetable"
poser_temoin
temoin_survit && vert "témoin posé (valeur 42) dans la base de travail" || ko "témoin non posé — la recette ne regarde rien"
psql_adm -c "DROP DATABASE IF EXISTS recette_shadow;" -c "CREATE DATABASE recette_shadow;" >/dev/null 2>&1
diff_avec_shadow "$(url_pour recette_shadow)" || ko "migrate diff a échoué"
if temoin_survit; then
  vert "la base de travail est intacte après migrate diff"
else
  ko "la base de travail a été effacée alors que la shadow était dédiée"
fi

echo
echo "── 2/2 · CONTRÔLE NÉGATIF — l'ancienne ligne : shadow = la base de travail"
poser_temoin
temoin_survit || ko "témoin non reposé"
diff_avec_shadow "$(url_pour recette_faux_dev)"
if temoin_survit; then
  ko "le témoin a survécu — la recette ne démontre rien, relire migrate diff"
else
  vert "le témoin a été DÉTRUIT — DATABASE_URL en shadow efface bien la base"
fi

psql_adm -c "DROP DATABASE IF EXISTS recette_faux_dev;" -c "DROP DATABASE IF EXISTS recette_shadow;" >/dev/null 2>&1

echo
if [ "$ECHECS" -eq 0 ]; then
  printf '\033[32mRecette « shadow jetable » : tout est vert.\033[0m\n\n'; exit 0
fi
printf '\033[31mRecette « shadow jetable » : %d échec(s).\033[0m\n\n' "$ECHECS"; exit 1
