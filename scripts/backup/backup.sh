#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Gafeso — sauvegarde de production (base PostgreSQL + objets MinIO)
#
# Sauvegarde les DEUX sources de vérité :
#   1. PostgreSQL (catalogue, comptes, prêts…) via pg_dump ;
#   2. les objets MinIO (couvertures, fichiers numériques) via une archive du
#      volume Docker — ces fichiers ne sont PAS dans le dump PostgreSQL.
#
# Usage (depuis la RACINE du dépôt) :
#   ./scripts/backup/backup.sh [dossier_destination]
# Défaut : ./backups/. Idéal en tâche cron quotidienne, ex. :
#   0 2 * * *  cd /chemin/gafeso && ./scripts/backup/backup.sh >> /var/log/gafeso-backup.log 2>&1
#
# RESTAURATION : voir scripts/backup/README.md.
#
# ── POURQUOI CE SCRIPT VÉRIFIE CE QU'IL PRODUIT ──────────────────────────
#
# UNE SAUVEGARDE QU'ON NE VÉRIFIE PAS N'EST PAS UNE SAUVEGARDE : c'est une
# case cochée. Le fichier `pre-migration-2026-07-11.dump` de ce dépôt pesait
# ZÉRO OCTET et personne ne l'a vu pendant un mois — la commande s'était
# terminée sans erreur, le fichier existait, la ligne de journal était verte.
# C'est exactement ainsi qu'on découvre le problème le jour de la restauration,
# c'est-à-dire le seul jour où il est trop tard.
#
# Écrire « pensez à vérifier » dans un guide ne suffit pas : c'est précisément
# ce qui vient d'échouer. Le contrôle appartient donc à l'outil.
#
# Trois garde-fous, dans cet ordre :
#
#   1. LE VOLUME MINIO DOIT EXISTER AVANT D'ÊTRE ARCHIVÉ. `docker run -v
#      nom_inexistant:/data` ne proteste pas : Docker CRÉE un volume vide et
#      l'archive réussit, produisant un `.tar.gz` parfaitement valide et
#      parfaitement vide. C'est le piège du préfixe de projet (une installation
#      historique s'appelle encore « bibliocloud-prod »).
#
#   2. CHAQUE ARCHIVE EST RELUE APRÈS ÉCRITURE. Pas seulement sa taille — un
#      dump tronqué peut peser des mégaoctets. On décompresse et on cherche la
#      signature que `pg_dump` écrit en tête ; pour MinIO, on liste l'archive.
#
#   3. UNE ARCHIVE INVALIDE EST SUPPRIMÉE, ET LA ROTATION N'A PAS LIEU. Laisser
#      le fichier douteux, c'est reproduire le `.dump` à zéro octet : quelqu'un
#      le prendra un jour pour une sauvegarde. Et surtout, on ne supprime JAMAIS
#      les anciennes sauvegardes quand la nouvelle est mauvaise — ce serait
#      échanger un jeu valide contre rien.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE="docker compose --env-file .env.prod -f docker/docker-compose.prod.yml"
# Préfixe des volumes. Lu depuis .env.prod EN PRIORITÉ : un cron n'hérite pas
# de l'environnement du shell, et une install historique s'appelle encore
# « bibliocloud-prod » — sauvegarder le mauvais projet produirait une archive
# vide sans le signaler.
PROJECT="${COMPOSE_PROJECT_NAME:-$(grep -E '^COMPOSE_PROJECT_NAME=' .env.prod 2>/dev/null | cut -d= -f2-)}"
PROJECT="${PROJECT:-bibliocloud-prod}"
DEST="${1:-$REPO_ROOT/backups}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

# Plancher de taille pour le dump SQL : un gzip de rien du tout pèse 20 octets.
# Le seuil attrape le cas grossier ; la vérification de CONTENU ci-dessous
# attrape le reste, y compris un dump tronqué de plusieurs mégaoctets.
#
# Pas de plancher pour l'archive MinIO, DÉLIBÉRÉMENT : une archive vide y pèse
# 87 octets (busybox tar) et c'est un état LÉGITIME sur une installation neuve
# où aucun document n'a encore été téléversé. Un seuil de taille y ferait
# échouer la sauvegarde nocturne de toute bibliothèque récente. Ce qu'il faut
# attraper à la place, c'est le volume INEXISTANT — garde-fou nº1 plus bas.
TAILLE_MIN_DB=200

echoerr() { printf '%s\n' "$*" >&2; }

# Échec : on retire l'archive douteuse et on sort en erreur SANS toucher aux
# anciennes sauvegardes (la rotation est en fin de script, jamais atteinte).
echouer() {
  local fichier="$1" motif="$2"
  echoerr ""
  echoerr "✖ SAUVEGARDE INVALIDE — $motif"
  if [ -f "$fichier" ]; then
    echoerr "  Archive supprimée : $fichier"
    echoerr "  (la laisser reviendrait à créer un faux positif de plus)"
    rm -f "$fichier"
  fi
  echoerr "  Les sauvegardes précédentes sont CONSERVÉES : la rotation n'a pas eu lieu."
  echoerr ""
  exit 1
}

taille_de() { stat -c%s "$1" 2>/dev/null || echo 0; }

mkdir -p "$DEST"

# Identifiants de base lus dans .env.prod (défauts = compose).
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env.prod 2>/dev/null | cut -d= -f2- || echo bibliocloud)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env.prod 2>/dev/null | cut -d= -f2- || echo bibliocloud)"

# ── 1. PostgreSQL ────────────────────────────────────────────────────────
FICHIER_DB="$DEST/db_${STAMP}.sql.gz"
echo "→ Sauvegarde PostgreSQL (${POSTGRES_DB})…"
$COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-bibliocloud}" "${POSTGRES_DB:-bibliocloud}" \
  | gzip > "$FICHIER_DB" \
  || echouer "$FICHIER_DB" "pg_dump a échoué (base arrêtée ? identifiants ?)"

TAILLE_DB="$(taille_de "$FICHIER_DB")"
[ "$TAILLE_DB" -ge "$TAILLE_MIN_DB" ] \
  || echouer "$FICHIER_DB" "dump de ${TAILLE_DB} octets — un gzip vide en pèse 20"

# Relecture : `pg_dump` écrit toujours cet en-tête. Son absence signale un
# fichier tronqué, corrompu, ou qui n'est pas un dump du tout.
ENTETE_DB="$(set +o pipefail; gzip -dc "$FICHIER_DB" 2>/dev/null | head -c 4096)"
printf '%s' "$ENTETE_DB" | grep -q 'PostgreSQL database dump' \
  || echouer "$FICHIER_DB" "l'en-tête « PostgreSQL database dump » est absent — archive illisible ou tronquée"

# Un dump sans aucun ordre SQL est syntaxiquement valide et parfaitement inutile.
NB_ORDRES="$(set +o pipefail; gzip -dc "$FICHIER_DB" 2>/dev/null | grep -c -E '^(CREATE|COPY|INSERT|ALTER) ' || true)"
[ "${NB_ORDRES:-0}" -gt 0 ] \
  || echouer "$FICHIER_DB" "aucun ordre CREATE/COPY/INSERT — la base sauvegardée est vide"

echo "  ✔ $FICHIER_DB  (${TAILLE_DB} o, ${NB_ORDRES} ordres SQL)"

# ── 2. Objets MinIO ──────────────────────────────────────────────────────
VOLUME="${PROJECT}_minio_data"
echo "→ Sauvegarde des objets MinIO (volume ${VOLUME})…"

# Garde-fou nº1 : sans lui, Docker crée le volume manquant et archive du vide.
if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  echoerr ""
  echoerr "✖ Le volume Docker « $VOLUME » n'existe pas."
  echoerr "  L'archiver produirait un fichier valide et VIDE : Docker aurait créé"
  echoerr "  le volume à la volée sans rien signaler."
  echoerr "  Vérifiez COMPOSE_PROJECT_NAME dans .env.prod (valeur lue : ${PROJECT})."
  echoerr "  Volumes MinIO présents sur cette machine :"
  docker volume ls --format '{{.Name}}' | grep -E 'minio' | sed 's/^/    /' >&2 \
    || echoerr "    (aucun)"
  echoerr ""
  echoerr "  Le dump PostgreSQL a été conservé :"
  echoerr "    $FICHIER_DB"
  echoerr "  Mais LA SAUVEGARDE EST INCOMPLÈTE : les documents numériques et les"
  echoerr "  couvertures ne sont PAS dans ce dump. Ne la comptez pas comme valide."
  echoerr "  Les sauvegardes précédentes sont conservées : pas de rotation."
  echoerr ""
  exit 1
fi

FICHIER_MINIO="$DEST/minio_${STAMP}.tar.gz"
docker run --rm \
  -v "${VOLUME}:/data:ro" \
  -v "$DEST:/backup" \
  busybox tar czf "/backup/minio_${STAMP}.tar.gz" -C /data . \
  || echouer "$FICHIER_MINIO" "l'archivage du volume a échoué"

TAILLE_MINIO="$(taille_de "$FICHIER_MINIO")"

# Relecture : l'archive doit se lister. Une archive corrompue ou tronquée
# échoue ici, quelle que soit sa taille.
tar tzf "$FICHIER_MINIO" >/dev/null 2>&1 \
  || echouer "$FICHIER_MINIO" "archive illisible (tar refuse de la lister)"
NB_ENTREES="$(set +o pipefail; tar tzf "$FICHIER_MINIO" 2>/dev/null | grep -c -v -E '^\./?$' || true)"

# Un volume MinIO VIDE est légitime sur une installation neuve : aucun document
# numérique n'a encore été téléversé. On le signale fort, sans faire échouer —
# refuser ici casserait la sauvegarde nocturne de toute installation récente.
if [ "${NB_ENTREES:-0}" -eq 0 ]; then
  echo "  ⚠ archive VIDE : aucun objet dans le volume."
  echo "    Normal sur une installation neuve (aucun document téléversé)."
  echo "    Anormal si votre bibliothèque a des documents numériques : vérifiez"
  echo "    alors que « $VOLUME » est bien le volume de l'installation en service."
else
  echo "  ✔ $FICHIER_MINIO  (${TAILLE_MINIO} o, ${NB_ENTREES} entrées)"
fi

# ── 3. Rotation — atteinte UNIQUEMENT si tout ce qui précède a réussi ────
find "$DEST" -name 'db_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
find "$DEST" -name 'minio_*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

echo "✔ Sauvegarde vérifiée et terminée (rétention ${RETENTION_DAYS} j) : $DEST"
