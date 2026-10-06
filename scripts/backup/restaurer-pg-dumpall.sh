#!/usr/bin/env bash
# Restaure UNE base depuis un fichier produit par `pg_dumpall` (sauvegarde à la main).
#
# ⚠ POURQUOI CE SCRIPT EXISTE, et c'est mesuré — pas supposé (6 octobre 2026) :
#
# Un fichier `pg_dumpall` SANS --clean, rejoué par la commande naïve
# `psql -f fichier` sur un cluster où la base existe déjà :
#
#   · rend le code de sortie 0            (psql ne rend 1 qu'avec ON_ERROR_STOP)
#   · émet 8 erreurs que personne ne lit  (préfixées « psql:fichier:ligne: »,
#                                          donc un grep '^ERROR' en compte ZÉRO)
#   · et AJOUTE les lignes des tables sans contrainte d'unicité :
#       une table « journal » de 2 lignes est repassée à 4.
#     Les tables à clé primaire sont sauvées par leur clé, pas par la prudence.
#
# ⚠ ET IL N'A AUCUN MODE SÛR. `pg_dumpall` émet toujours `CREATE ROLE postgres`,
# qui existe toujours — donc avec ON_ERROR_STOP=1 il s'arrête à la ligne 15 sur
# TOUT cluster, même vide, et la base n'est jamais créée. Il n'y a pas d'option
# à ajouter : c'est une propriété du format.
#
# D'où la seule forme qui a un VERDICT, mesurée à 0 erreur et code 0 :
#   extraire la SECTION de la base visée (de son `\connect` au `\connect`
#   suivant), recréer la base vide, et rejouer cette section avec
#   ON_ERROR_STOP=1 — qui refuse alors pour de bon.
#
# Usage :
#   restaurer-pg-dumpall.sh --verifier <fichier.sql>
#   restaurer-pg-dumpall.sh --restaurer <fichier.sql> <base> [--conteneur <nom>]
set -euo pipefail

MODE="${1:-}"; FICHIER="${2:-}"; BASE="${3:-}"; CONTENEUR=""
shift 2 2>/dev/null || true
while [ $# -gt 0 ]; do
  case "$1" in
    --conteneur) CONTENEUR="$2"; shift 2;;
    *) shift;;
  esac
done

psql_() {
  if [ -n "$CONTENEUR" ]; then docker exec -i "$CONTENEUR" psql "$@"
  else psql "$@"; fi
}
pgdump_() {
  if [ -n "$CONTENEUR" ]; then docker exec -i "$CONTENEUR" pg_dump "$@"
  else pg_dump "$@"; fi
}

[ -s "${FICHIER:-}" ] || { echo "REFUSÉ : fichier absent ou vide — « ${FICHIER:-<aucun>} »." >&2; exit 2; }

# ── Ce que le fichier contient, et ce que ça implique ────────────────────────
bases=$(grep -oE '^\\connect [^ ]+$' "$FICHIER" | awk '{print $2}' | grep -v '^template' || true)
avec_clean=$(grep -cE '^DROP DATABASE' "$FICHIER" || true)
roles=$(grep -cE '^CREATE ROLE ' "$FICHIER" || true)

if [ "$MODE" = "--verifier" ]; then
  echo "Fichier    : $FICHIER ($(wc -c < "$FICHIER") octets)"
  echo "Bases      : $(echo "$bases" | tr '\n' ' ')"
  echo "Rôles      : $roles  (dont « postgres », qui existe TOUJOURS)"
  if [ "$avec_clean" -gt 0 ]; then
    echo "Forme      : pg_dumpall --clean — il sait DÉTRUIRE avant de recréer."
    echo "Verdict    : restaurable tel quel sur un cluster existant."
  else
    echo "Forme      : pg_dumpall SANS --clean."
    echo "⚠ Verdict  : NON restaurable par « psql -f » sur un cluster où la base"
    echo "             existe — les tables sans contrainte DOUBLERAIENT, et psql"
    echo "             rendrait 0. Utilisez --restaurer, qui extrait la section."
  fi
  exit 0
fi

[ "$MODE" = "--restaurer" ] || { echo "Usage : $0 --verifier <f> | --restaurer <f> <base> [--conteneur <n>]" >&2; exit 2; }
[ -n "${BASE:-}" ] || { echo "REFUSÉ : nommez la base à restaurer." >&2; exit 2; }
echo "$bases" | grep -qx "$BASE" || {
  echo "REFUSÉ : « $BASE » n'est pas dans ce fichier. Il porte : $(echo "$bases" | tr '\n' ' ')" >&2
  exit 3
}

# ── La section de CETTE base, et rien d'autre ───────────────────────────────
SECTION=$(mktemp); trap 'rm -f "$SECTION"' EXIT
awk -v b="\\\\connect $BASE" '$0==b{f=1;next} /^\\connect /{f=0} f' "$FICHIER" > "$SECTION"
copies=$(grep -cE '^COPY ' "$SECTION" || true)
[ "$copies" -gt 0 ] || {
  echo "REFUSÉ : la section de « $BASE » ne contient AUCUN ordre COPY." >&2
  echo "         Un fichier qui n'a rien à réécrire restaurerait une base VIDE" >&2
  echo "         en annonçant un succès. Rien n'a été détruit." >&2
  exit 4
}
echo "Section de « $BASE » : $(wc -l < "$SECTION") lignes, $copies tables à recharger."

# ── On ne détruit jamais sans filet ─────────────────────────────────────────
FILET="${FICHIER%.sql}-filet-avant-restauration-$(date -u +%Y%m%dT%H%M%SZ).sql"
if psql_ -U postgres -tAc "select 1 from pg_database where datname='$BASE'" | grep -q 1; then
  pgdump_ -U postgres --clean --if-exists "$BASE" > "$FILET"
  [ -s "$FILET" ] || { echo "REFUSÉ : le filet de sauvegarde est VIDE. Rien n'a été détruit." >&2; exit 5; }
  echo "Filet    : $FILET ($(wc -c < "$FILET") octets) — il porte --clean, lui."
  proprio=$(psql_ -U postgres -tAc "select pg_get_userbyid(datdba) from pg_database where datname='$BASE'" | tr -d '[:space:]')
  psql_ -U postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE \"$BASE\""
else
  proprio=postgres
  echo "Filet    : inutile, « $BASE » n'existe pas encore."
fi
psql_ -U postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$BASE\" OWNER \"$proprio\""

# ── Et le rejeu REFUSE, il ne rapporte pas ─────────────────────────────────
if ! psql_ -U postgres -d "$BASE" -v ON_ERROR_STOP=1 -q -o /dev/null -f /dev/stdin < "$SECTION"; then
  echo "" >&2
  echo "🔴 RESTAURATION REFUSÉE — la section n'a pas été rejouée entièrement." >&2
  echo "   La base « $BASE » est dans un état PARTIEL." >&2
  echo "   Reprenez l'état d'avant avec le filet :" >&2
  echo "     psql -U postgres -d $BASE -v ON_ERROR_STOP=1 -f $FILET" >&2
  exit 6
fi
echo "✓ Restauré : « $BASE », 0 erreur, section rejouée en entier."
echo "  ⚠ Les RÔLES et leurs mots de passe ne sont pas dans cette section."
echo "    Ils vivent en tête du fichier et restent ceux du cluster."
