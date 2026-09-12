#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# Gafeso — renommage OPTIONNEL d'une installation historique.
#
# Le produit s'appelait BiblioCloud. Les installations antérieures portent
# encore ces identifiants d'infrastructure :
#
#   projet Compose  bibliocloud-prod   → préfixe des VOLUMES et du réseau
#   base / rôle PG  bibliocloud        → base de données et son propriétaire
#   clé MinIO       bibliocloud        → identifiant d'accès au stockage
#
# ELLES FONCTIONNENT TRÈS BIEN AINSI. Les fichiers compose conservent ces
# valeurs par défaut : une installation existante démarre sans intervention.
# Ce script n'existe que pour l'exploitant qui veut aligner les noms.
#
#   ./scripts/rename-to-gafeso.sh --dry-run   # n'écrit RIEN, montre le plan
#   ./scripts/rename-to-gafeso.sh             # exécute (demande confirmation)
#
# ⚠ ARRÊT DE SERVICE. La pile est stoppée pendant toute l'opération. Comptez
#   de quelques minutes à une heure selon la taille du fonds (la recopie des
#   volumes domine). À faire hors des heures d'ouverture.
#
# COMMENT : un dump complet est pris D'ABORD, comme filet. La base et son rôle
#   sont ensuite renommés EN PLACE (`ALTER DATABASE/ROLE ... RENAME`) — c'est
#   instantané, PostgreSQL ne recopie pas les données, et c'est plus sûr qu'un
#   restore. Les VOLUMES, eux, doivent être recopiés : leur nom dérive du nom
#   de projet Compose, que Docker ne sait pas renommer. La recopie se fait
#   pile ARRÊTÉE, jamais sur un PostgreSQL en cours d'écriture.
#
#   Les anciens volumes et le dump ne sont JAMAIS supprimés — c'est le retour
#   arrière.
# ═════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
ENV_FILE=".env.prod"
COMPOSE_FILE="docker/docker-compose.prod.yml"

if [ -t 1 ]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; RST=$'\e[0m'
else
  BOLD=''; DIM=''; RED=''; GRN=''; YLW=''; RST=''
fi
info() { printf '→ %s\n' "$*"; }
ok()   { printf '%s✔%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s⚠%s %s\n' "$YLW" "$RST" "$*"; }
die()  { printf '\n%s✖ %s%s\n' "$RED$BOLD" "$*" "$RST" >&2; exit 1; }

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1
[ "${1:-}" = "--help" ] && { sed -n '2,/^# ═\{10,\}$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

run() { # exécute, ou décrit seulement en dry-run
  if [ "$DRY_RUN" = 1 ]; then printf '%s  [dry-run] %s%s\n' "$DIM" "$*" "$RST"; else "$@"; fi
}

[ -f "$ENV_FILE" ] || die "$ENV_FILE introuvable : lancez ce script depuis la racine du dépôt, sur le serveur."

env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1; }

OLD_PROJECT="$(env_value COMPOSE_PROJECT_NAME)"; OLD_PROJECT="${OLD_PROJECT:-bibliocloud-prod}"
OLD_DB="$(env_value POSTGRES_DB)";               OLD_DB="${OLD_DB:-bibliocloud}"
OLD_USER="$(env_value POSTGRES_USER)";           OLD_USER="${OLD_USER:-bibliocloud}"
NEW_PROJECT="gafeso-prod"; NEW_DB="gafeso"; NEW_USER="gafeso"

if [ "$OLD_PROJECT" = "$NEW_PROJECT" ] && [ "$OLD_DB" = "$NEW_DB" ] && [ "$OLD_USER" = "$NEW_USER" ]; then
  ok "Cette installation utilise déjà les noms Gafeso. Rien à faire."
  exit 0
fi

printf '\n%sPlan de renommage%s\n' "$BOLD" "$RST"
printf '  projet Compose : %-20s → %s\n' "$OLD_PROJECT" "$NEW_PROJECT"
printf '  base PostgreSQL: %-20s → %s\n' "$OLD_DB" "$NEW_DB"
printf '  rôle PostgreSQL: %-20s → %s\n' "$OLD_USER" "$NEW_USER"
printf '  volumes        : %s_* → %s_* %s(recopiés, les anciens sont conservés)%s\n' \
  "$OLD_PROJECT" "$NEW_PROJECT" "$DIM" "$RST"

dc_old() { docker compose --env-file "$ENV_FILE" -p "$OLD_PROJECT" -f "$COMPOSE_FILE" "$@"; }

if [ "$DRY_RUN" = 1 ]; then
  printf '\n%sMode dry-run : aucune écriture.%s\n' "$BOLD" "$RST"
  info "Volumes qui seraient recopiés :"
  docker volume ls -q 2>/dev/null | grep "^${OLD_PROJECT}_" | sed 's/^/    /' || echo "    (aucun volume trouvé)"
  info "Sauvegarde qui serait produite : backups/rename-<horodatage>.sql.gz"
  printf '\n%sRelancez sans --dry-run pour exécuter.%s\n' "$BOLD" "$RST"
  exit 0
fi

printf '\n%s⚠ ARRÊT DE SERVICE : la plateforme sera indisponible pendant l'\''opération.%s\n' "$YLW$BOLD" "$RST"
printf '%sSauvegardez avant (./scripts/backup/backup.sh) si ce n'\''est pas déjà fait.%s\n' "$DIM" "$RST"
read -r -p "Taper exactement « RENOMMER » pour continuer : " answer
[ "$answer" = "RENOMMER" ] || die "Annulé (rien n'a été modifié)."

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="backups/rename-${STAMP}.sql.gz"
mkdir -p backups

# 1) Dump COMPLET avant tout (le filet, indépendant des volumes).
info "1/6 · Sauvegarde de la base $OLD_DB → $DUMP"
# Pipeline : pas passable à run(), qui exécute un argv. Le filet vaut la
# duplication du garde dry-run.
if [ "$DRY_RUN" = 1 ]; then
  printf '%s  [dry-run] pg_dump %s > %s%s\n' "$DIM" "$OLD_DB" "$DUMP" "$RST"
else
  dc_old exec -T db pg_dump -U "$OLD_USER" "$OLD_DB" | gzip > "$DUMP"
  [ -s "$DUMP" ] || die "Sauvegarde vide : opération interrompue, rien n'a été modifié."
  ok "Sauvegarde faite ($(du -h "$DUMP" | cut -f1))."
fi

# 2) Renommage EN PLACE du rôle et de la base : plus sûr qu'un restore, et
#    instantané (PostgreSQL ne recopie pas les données). Nécessite qu'aucune
#    connexion ne soit ouverte → l'api est arrêtée d'abord.
info "2/6 · Arrêt de l'api et du web (la base reste debout pour le renommage)"
run dc_old stop api web

info "3/6 · Renommage du rôle et de la base"
run dc_old exec -T db psql -U "$OLD_USER" -d postgres -c "ALTER ROLE \"$OLD_USER\" RENAME TO \"$NEW_USER\";"
run dc_old exec -T db psql -U "$NEW_USER" -d postgres -c "ALTER DATABASE \"$OLD_DB\" RENAME TO \"$NEW_DB\";"
ok "Rôle et base renommés."

# 3) Recopie des volumes. La pile est arrêtée AVANT : copier le répertoire de
#    données d'un PostgreSQL en cours d'écriture donnerait une copie
#    incohérente, susceptible de ne pas redémarrer.
info "4/6 · Arrêt complet de la pile, puis recopie des volumes"
run dc_old down
for suffix in minio_data meili_data caddy_data caddy_config db_data; do
  src="${OLD_PROJECT}_${suffix}"; dst="${NEW_PROJECT}_${suffix}"
  docker volume inspect "$src" >/dev/null 2>&1 || continue
  run docker volume create "$dst"
  run docker run --rm -v "$src":/from:ro -v "$dst":/to alpine:latest \
    sh -c 'cd /from && cp -a . /to/'
  printf '    %s → %s\n' "$src" "$dst"
done
ok "Volumes recopiés (les anciens sont CONSERVÉS)."

# 4) Bascule du .env.prod.
info "5/6 · Mise à jour de $ENV_FILE"
run cp "$ENV_FILE" "${ENV_FILE}.avant-renommage-${STAMP}"
set_env() { # set_env CLÉ VALEUR — remplace ou ajoute
  if grep -qE "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}
if [ "$DRY_RUN" != 1 ]; then
  set_env COMPOSE_PROJECT_NAME "$NEW_PROJECT"
  set_env POSTGRES_DB "$NEW_DB"
  set_env POSTGRES_USER "$NEW_USER"
fi
ok "$ENV_FILE mis à jour (copie : ${ENV_FILE}.avant-renommage-${STAMP})."

# 5) Redémarrage sous le NOUVEAU nom de projet.
info "6/6 · Démarrage de la pile sous le nouveau nom de projet"
run docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

printf '\n%s✔ Renommage terminé.%s\n' "$GRN$BOLD" "$RST"
printf '  Vérifiez : docker compose --env-file %s -f %s ps\n' "$ENV_FILE" "$COMPOSE_FILE"
printf '\n%sRetour arrière possible%s : les anciens volumes %s_* existent encore,\n' "$BOLD" "$RST" "$OLD_PROJECT"
printf '  et %s restaure la base. Ne les supprimez qu'\''après plusieurs jours\n' "$DUMP"
printf '  de fonctionnement normal.\n\n'
