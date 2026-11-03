#!/usr/bin/env bash
# RECETTE — UN PAS SAUTÉ FAIT TOMBER LE CODE DE SORTIE DU SEED.
#
# ⭐⭐ POURQUOI CETTE RECETTE EXISTE, ET POURQUOI PAS DANS `npm test`
#
# *Tranché par le responsable le 3 novembre 2026 :* « `npm test` doit rester
# lançable sans infrastructure : c'est ce qui fait qu'on le lance souvent. Y
# mettre une dépendance à une pile vivante le rendrait sautable, et un garde
# qu'on saute ne garde rien. »
#
# ⚠ NE RAMENEZ PAS CETTE MESURE DANS `npm test`. Elle exige un cluster
# PostgreSQL, une API démarrée et un Meilisearch — trois choses qu'une machine
# de développement n'a pas toujours. `seed-conclut-ce-qu-il-a-fait.spec.ts`
# garde la STRUCTURE sans infrastructure ; celle-ci garde l'EFFET avec. Les deux
# moitiés sont nécessaires, et aucune ne remplace l'autre.
#
# ## 🔴 CE QUE ÇA A COÛTÉ, et qui décide de la forme
#
# *Mesuré par le responsable sur la démo, deuxième passe de `seed-demo.mjs` :*
#
#     • réindexation ignorée (login bibliothécaire indisponible)
#     ✔ Démo prête.
#
# Il annonçait « prête » après avoir SAUTÉ la réindexation. Le catalogue n'en a
# pas souffert ce jour-là — l'index de la passe précédente tenait — mais sur une
# PREMIÈRE exécution, il aurait rendu une démo au catalogue VIDE en se déclarant
# prête. Un `set -e`, une CI ou un `&&` ne regardent que le code de sortie.
#
# ⚠ ET LA CAUSE DU LOGIN INDISPONIBLE EST MESURÉE, elle aussi :
# `sessionBibliothecaire()` envoie `Host: localhost`, et depuis que les domaines
# de la démo ont été échangés, `localhost` appartient à l'autre école — où
# `bib@exemple.bf` n'existe pas. Le login échouait donc pour une raison
# parfaitement légitime, et c'est la CONCLUSION qui était fautive.
#
# ## ⚠ ELLE NE TOUCHE AUCUNE INSTANCE EN SERVICE
#
# Cluster PostgreSQL jetable, Meilisearch jetable, API sur un port libre, tout
# détruit en sortant par `trap`. Aucun conteneur existant n'est arrêté : le
# levier d'échec est un MEILI_HOST pointé vers un port mort, pas l'arrêt d'un
# service que quelqu'un d'autre utilise.
#
# Usage : scripts/recette-reserves-du-seed.sh
set -uo pipefail
cd "$(dirname "$0")/.."

CONTENEUR_PG="gafeso-recette-seed-pg-$$"
CONTENEUR_MS="gafeso-recette-seed-ms-$$"
PORT_PG=55441
PORT_MS=7741
PORT_API=4131
MDP_JETABLE="$(openssl rand -hex 16)"
SECRET_JETABLE="$(openssl rand -hex 32)"
CLE_ADMIN="$(openssl rand -hex 24)"
CLE_MEILI="$(openssl rand -hex 24)"
# ⚠ IL S'ENGENDRE, IL NE S'ÉCRIT PAS. Ma première version posait SEED_PASSWORD
# à une chaîne littérale, et le garde de contenu a REFUSÉ le commit — alors que
# je venais de lire, dans l'en-tête de `recette-assistant-installation.sh`, la
# leçon exacte : « la règle ne se module PAS selon la valeur du secret, sinon il
# faut juger à chaque fois ». Un secret jetable reste un secret versionné.
#
# ⚠ ET LE GARDE A ENSUITE REFUSÉ MON COMMENTAIRE, qui citait la forme fautive.
# Il avait raison une seconde fois, et la distinction vaut d'être notée : la
# règle « un relevé textuel dépouille les commentaires » (CLAUDE.md §2) ne
# s'applique PAS à un détecteur de secrets. Un secret dans un commentaire est
# un secret publié — on décrit donc la forme sans l'écrire.
MDP_SEED="Gf-$(openssl rand -hex 10)-A1!"
ETAT=$(mktemp -d)
API_PID=""
ECHECS=0

vert()  { printf '  ✓ %s\n' "$1"; }
rouge() { printf '  🔴 %s\n' "$1"; ECHECS=$((ECHECS+1)); }
gris()  { printf '    %s\n' "$1"; }
titre() { printf '\n═══ %s ═══\n' "$1"; }

nettoyer() {
  [ -n "$API_PID" ] && { kill "$API_PID" 2>/dev/null; wait "$API_PID" 2>/dev/null; } || true
  docker rm -f "$CONTENEUR_PG" "$CONTENEUR_MS" >/dev/null 2>&1 || true
  rm -rf "$ETAT"
}
trap nettoyer EXIT

# ── Démarre l'API avec le MEILI_HOST demandé, et attend /health.
demarrer_api() { # demarrer_api <meili_host>
  [ -n "$API_PID" ] && { kill "$API_PID" 2>/dev/null; wait "$API_PID" 2>/dev/null; API_PID=""; } || true
  env -i PATH="$PATH" HOME="$HOME" \
    DATABASE_URL="$DATABASE_URL" API_PORT="$PORT_API" NODE_ENV=development \
    APP_URL="http://localhost:3000" JWT_SECRET="$SECRET_JETABLE" \
    ADMIN_API_KEY="$CLE_ADMIN" \
    MEILI_HOST="$1" MEILI_MASTER_KEY="$CLE_MEILI" \
    GAFESO_ETAT_DIR="$ETAT" GAFESO_JETON_INSTALLATION_FICHIER="$ETAT/jeton.txt" \
    GAFESO_VERSION="v0.0.0-recette" GAFESO_COMMIT="0000000" \
    node apps/api/dist/main.js > "$ETAT/api.log" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 60); do curl -fsS "http://localhost:$PORT_API/health" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

# ── Joue le seed contre la pile jetable. Rend son code de sortie.
jouer_le_seed() { # jouer_le_seed <fichier_de_sortie>
  env -i PATH="$PATH" HOME="$HOME" \
    SEED_API_URL="http://localhost:$PORT_API" \
    ADMIN_API_KEY="$CLE_ADMIN" \
    APP_URL="http://localhost:3000" \
    DATABASE_URL="$DATABASE_URL" \
    SEED_PASSWORD="$MDP_SEED" \
    node scripts/seed-demo.mjs > "$1" 2>&1
}

titre "préparation — cluster jetable, migrations, construction"
docker run -d --name "$CONTENEUR_PG" -e POSTGRES_PASSWORD="$MDP_JETABLE" \
  -p "$PORT_PG":5432 postgres:16 >/dev/null || { echo "docker indisponible" >&2; exit 2; }
for _ in $(seq 1 60); do docker exec "$CONTENEUR_PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CONTENEUR_PG" pg_isready -U postgres >/dev/null \
  || { rouge "cluster injoignable — INDÉCIDABLE, la recette ne mesure rien"; exit 2; }
export DATABASE_URL="postgresql://postgres:${MDP_JETABLE}@localhost:${PORT_PG}/postgres?schema=public"
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma >/dev/null 2>&1
appliquees=$(docker exec "$CONTENEUR_PG" psql -U postgres -tAc \
  "select count(*) from public._prisma_migrations where finished_at is not null" | tr -d ' ')
[ "${appliquees:-0}" -gt 30 ] && vert "$appliquees migrations appliquées" \
  || { rouge "seulement ${appliquees:-0} migrations — la recette ne mesurerait rien"; exit 2; }
[ -f apps/api/dist/main.js ] || npm run build -w @gafeso/api >/dev/null 2>&1
[ -f apps/api/dist/main.js ] || { rouge "dist/main.js absent — construction échouée"; exit 2; }
vert "API construite"

# ═══════════════════════════════════════════════════════════════════════════
titre "① LE PAS SAUTÉ — Meilisearch injoignable, la réindexation DOIT réserver"
# ⚠ Le levier est un port MORT, pas l'arrêt d'un service : on ne touche à rien
# de ce qui tourne sur cette machine.
if demarrer_api "http://127.0.0.1:1"; then
  vert "API démarrée avec un Meilisearch injoignable (port 1)"
  jouer_le_seed "$ETAT/seed-sans-index.log"; code=$?
  if [ "$code" = 3 ]; then
    vert "⭐⭐ code de sortie 3 — le pas sauté FAIT TOMBER la conclusion"
  else
    rouge "code de sortie $code, attendu 3 — un appelant conclurait au succès"
    tail -12 "$ETAT/seed-sans-index.log" | sed 's/^/      /'
  fi
  grep -q 'AVEC RÉSERVE' "$ETAT/seed-sans-index.log" \
    && vert "la conclusion dit « AVEC RÉSERVE »" \
    || rouge "la conclusion ne nomme pas la réserve"
  grep -qE 'RÉSERVE — le catalogue N.A PAS été réindexé' "$ETAT/seed-sans-index.log" \
    && vert "la réserve NOMME le pas manquant" \
    || rouge "la réserve ne nomme pas la réindexation"
  grep -q 'relancez ce seed' "$ETAT/seed-sans-index.log" \
    && vert "elle dit QUOI RELANCER" \
    || rouge "elle ne dit pas quoi relancer"
  grep -q 'aucun pas sauté' "$ETAT/seed-sans-index.log" \
    && rouge "elle annonce AUSSI « aucun pas sauté » — les deux conclusions sortent" \
    || vert "elle n'annonce PAS « aucun pas sauté »"
else
  rouge "l'API n'a pas démarré — INDÉCIDABLE"; tail -8 "$ETAT/api.log" | sed 's/^/      /'
fi

# ═══════════════════════════════════════════════════════════════════════════
titre "② TÉMOIN D'ABSENCE — avec un Meilisearch VIVANT, le seed sort en 0"
# ⚠ Sans ce second sens, un seed qui rendrait TOUJOURS 3 satisferait ①. C'est le
# témoin qui sépare « il mesure » de « il refuse tout ».
docker run -d --name "$CONTENEUR_MS" -e MEILI_MASTER_KEY="$CLE_MEILI" \
  -e MEILI_ENV=development -p "$PORT_MS":7700 getmeili/meilisearch:v1.6 >/dev/null 2>&1
pret=0
for _ in $(seq 1 60); do curl -fsS "http://localhost:$PORT_MS/health" >/dev/null 2>&1 && { pret=1; break; }; sleep 1; done
if [ "$pret" = 1 ]; then
  vert "Meilisearch jetable prêt sur $PORT_MS"
  if demarrer_api "http://localhost:$PORT_MS"; then
    jouer_le_seed "$ETAT/seed-avec-index.log"; code=$?
    if [ "$code" = 0 ]; then
      vert "⭐⭐ code de sortie 0 — aucune réserve quand rien n'est sauté"
    else
      rouge "code de sortie $code, attendu 0 — le garde refuserait tout"
      tail -12 "$ETAT/seed-avec-index.log" | sed 's/^/      /'
    fi
    grep -q 'aucun pas sauté' "$ETAT/seed-avec-index.log" \
      && vert "la conclusion dit « aucun pas sauté »" \
      || rouge "la conclusion ne confirme pas l'absence de saut"
    grep -q 'catalogue réindexé' "$ETAT/seed-avec-index.log" \
      && vert "le catalogue a RÉELLEMENT été réindexé" \
      || rouge "la réindexation n'a pas eu lieu alors que Meilisearch répond"
  else
    rouge "l'API n'a pas redémarré sur le Meilisearch jetable — INDÉCIDABLE"
  fi
else
  # ⚠ On ne conclut PAS « bon » : sans ce témoin, ① pourrait être satisfait par
  # un seed qui échoue toujours.
  rouge "Meilisearch jetable injoignable — INDÉCIDABLE, le témoin d'absence n'a pas pu jouer"
fi

# ═══════════════════════════════════════════════════════════════════════════
titre "③ LE GARDE-FOU DE DÉPLOIEMENT — le cas EXACT de la démo"
# Auto-adresse locale, déploiement PUBLIC : c'est la combinaison qui a laissé ce
# seed tourner sur un serveur public et y créer des domaines `localhost`.
sortie_garde="$(env -i PATH="$PATH" HOME="$HOME" \
  APP_URL="https://demo.exemple.org" SEED_API_URL="http://localhost:$PORT_API" \
  DATABASE_URL="$DATABASE_URL" node scripts/seed-demo.mjs 2>&1)"
code=$?
[ "$code" = 2 ] && vert "code 2 — refusé sur un déploiement public" \
  || rouge "code $code, attendu 2 : le seed a tourné sur un déploiement public"
printf '%s' "$sortie_garde" | grep -q 'DÉPLOIEMENT NON LOCAL' \
  && vert "la cause est nommée" || rouge "cause non nommée : $sortie_garde"
printf '%s' "$sortie_garde" | grep -q "localhost:$PORT_API" \
  && vert "le message NOMME l'auto-adresse — la confusion ne reviendra pas" \
  || rouge "le message ne distingue pas l'auto-adresse du déploiement"

printf '\n'
if [ "$ECHECS" = 0 ]; then
  printf '✓ Recette des réserves du seed : VERTE\n'
  exit 0
fi
printf '🔴 Recette des réserves du seed : %s échec(s)\n' "$ECHECS"
exit 1
