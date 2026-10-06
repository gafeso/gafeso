#!/usr/bin/env bash
# RECETTE : les secrets sont-ils contrôlés sur CE QUE LE CONTENEUR REÇOIT ?
#
# 🔴 CE QU'ELLE EXISTE POUR ATTRAPER, et ça a coûté un démarrage de PRODUCTION
# (6 octobre 2026, mesuré par Jean sur la démonstration) :
#
#     REFUS DE DÉMARRER — POSTGRES_PASSWORD est VIDE.
#
# `.env.prod` la portait, 43 caractères. Mais le conteneur `api` ne reçoit PAS
# cette variable : le compose de production ne lui passe que `DATABASE_URL`,
# composée depuis elle. Le contrôle vérifiait une variable absente du conteneur
# qu'il protège.
#
# ⚠ ET POURQUOI AUCUNE RECETTE NE L'AVAIT VU :
#
#   > ⭐ Une recette qui FOURNIT l'environnement qu'elle éprouve ne mesure que
#   > sa propre fixture.
#
# L'ancienne faisait `env -i JWT_SECRET=… POSTGRES_PASSWORD=… node dist/main.js`.
# Elle démarrait l'API, elle la démarrait bien — et jamais par le chemin qui la
# démarre en production. Celle-ci démarre `api` PAR LE COMPOSE DE PRODUCTION, et
# lit l'environnement DANS le conteneur.
#
# ⚠ Elle ne touche aucune instance en service : projet docker dédié, volumes
# dédiés, `caddy` et `web` jamais démarrés (donc aucun port publié), et
# nettoyage par DIFFÉRENCE d'ensembles contre un recensement de départ.
#
# Usage : ./scripts/recette-secrets-dans-le-conteneur.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PROJET=gafeso-recette-secrets
COMPOSE=docker/docker-compose.prod.yml
BAC="$(mktemp -d)"
ENVF="$BAC/.env.prod"
ECHECS=0

vert()  { printf '  ✓ %s\n' "$1"; }
rouge() { printf '  🔴 %s\n' "$1"; ECHECS=$((ECHECS+1)); }
titre() { printf '\n═══ %s ═══\n' "$1"; }

dc() { docker compose --env-file "$ENVF" -f "$COMPOSE" -p "$PROJET" "$@"; }

# ⚠ RECENSEMENT AVANT : le nettoyage se fait par DIFFÉRENCE, jamais par
# « j'ai supprimé ce que j'ai créé ».
VOL_AVANT="$(docker volume ls -q | LC_ALL=C sort)"
CNT_AVANT="$(docker ps -aq | LC_ALL=C sort)"

nettoyer() {
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  # tout volume/conteneur APPARU et non présent au départ
  comm -13 <(printf '%s\n' "$VOL_AVANT") <(docker volume ls -q | LC_ALL=C sort) \
    | grep "^$PROJET" | xargs -r docker volume rm -f >/dev/null 2>&1 || true
  rm -rf "$BAC"
}
trap nettoyer EXIT

# ── Un .env.prod JETABLE, aux secrets ENGENDRÉS (jamais écrits)
titre "préparation — un .env.prod jetable, secrets engendrés"
cat > "$ENVF" <<ENV
COMPOSE_PROJECT_NAME=$PROJET
APP_URL=https://recette.invalid
API_DOMAIN=https://api.recette.invalid
PUBLIC_DOMAIN=recette.invalid
STORAGE_DOMAIN=storage.recette.invalid
ACME_EMAIL=recette@recette.invalid
MINIO_PUBLIC_URL=https://storage.recette.invalid
HTTP_PORT=18080
HTTPS_PORT=18443
POSTGRES_USER=bibliocloud
POSTGRES_DB=bibliocloud
POSTGRES_PASSWORD=$(openssl rand -hex 22)
JWT_SECRET=$(openssl rand -hex 24)
ADMIN_API_KEY=$(openssl rand -hex 16)
MEILI_MASTER_KEY=$(openssl rand -hex 16)
MINIO_ROOT_USER=recette
MINIO_ROOT_PASSWORD=$(openssl rand -hex 12)
OFFLINE_CONTENT_KEK=$(openssl rand -base64 32)
OFFLINE_LICENSE_PRIVATE_KEY=$(openssl genpkey -algorithm ed25519 2>/dev/null | awk 'BEGIN{ORS="\\n"}1')
ENV
chmod 600 "$ENVF"
vert "secrets engendrés — aucune valeur écrite dans ce script"
# ⚠ Témoin : le fichier porte bien les six, sinon la recette mesurerait un vide
for v in POSTGRES_PASSWORD JWT_SECRET ADMIN_API_KEY MEILI_MASTER_KEY MINIO_ROOT_PASSWORD OFFLINE_CONTENT_KEK; do
  grep -q "^$v=..*" "$ENVF" || rouge "le .env.prod jetable n'a pas de $v"
done
[ "$ECHECS" = 0 ] && vert "les six secrets sont dans le .env.prod jetable"

# ── L'API démarre-t-elle PAR LE COMPOSE DE PRODUCTION ?
titre "① l'api démarre par le compose de PRODUCTION (pas par un env que je fournis)"
if ! dc up -d --build api >"$BAC/up.log" 2>&1; then
  rouge "le démarrage a échoué"
  tail -20 "$BAC/up.log" | sed 's/^/      /'
  dc logs --no-color api 2>/dev/null | tail -20 | sed 's/^/      /'
  exit 1
fi
etat=""
for _ in $(seq 1 90); do
  etat="$(dc ps --format '{{.Health}}' api 2>/dev/null | head -1)"
  [ "$etat" = healthy ] && break
  sleep 2
done
if [ "$etat" = healthy ]; then
  vert "conteneur api SAIN — assertProductionSecrets a passé sur l'environnement RÉEL"
else
  rouge "api jamais sain (état « $etat »)"
  dc logs --no-color api 2>/dev/null | tail -25 | sed 's/^/      /'
fi

# ── ⭐ LA MESURE QUI AURAIT ATTRAPÉ LE DÉFAUT
titre "② ce que le conteneur REÇOIT vraiment"
recu="$(dc exec -T api env 2>/dev/null | cut -d= -f1 | LC_ALL=C sort || true)"
[ -n "$recu" ] && vert "$(printf '%s' "$recu" | wc -l) variables lues DANS le conteneur" \
              || rouge "impossible de lire l'environnement du conteneur"
if printf '%s\n' "$recu" | grep -qx POSTGRES_PASSWORD; then
  rouge "le conteneur reçoit POSTGRES_PASSWORD — la déclaration portePar est devenue inutile"
else
  vert "⭐ POSTGRES_PASSWORD est ABSENTE du conteneur — exactement le défaut de rc4"
fi
printf '%s\n' "$recu" | grep -qx DATABASE_URL \
  && vert "DATABASE_URL est présente — c'est elle qui porte le mot de passe" \
  || rouge "DATABASE_URL absente du conteneur"

# ── Chaque secret, jugé PAR LE MODULE, DANS le conteneur
titre "③ chaque secret déclaré, jugé par le module DANS le conteneur"
sortie="$(dc exec -T api node -e '
const { SECRETS_DE_PRODUCTION, valeurEffective, refusDesSecrets } =
  require("/app/apps/api/dist/common/secrets-de-production");
for (const s of SECRETS_DE_PRODUCTION) {
  const v = valeurEffective(s, (n) => process.env[n]);
  const ou = s.portePar ? s.portePar.variable : s.variable;
  console.log([s.variable, ou, (v ?? "").length].join("|"));
}
console.log("REFUS|" + refusDesSecrets((n) => process.env[n]).length);
' 2>/dev/null || true)"
if [ -z "$sortie" ]; then
  rouge "le module n'a pas pu être interrogé dans le conteneur"
else
  vus=0
  while IFS='|' read -r nom ou longueur; do
    [ "$nom" = REFUS ] && continue
    vus=$((vus+1))
    if [ "${longueur:-0}" -gt 0 ]; then
      printf '  ✓ %-22s lu dans %-14s %s caractères\n' "$nom" "$ou" "$longueur"
    elif [ "$nom" = ADMIN_API_KEY ]; then
      printf '  ✓ %-22s vide — autorisé (routes de plateforme désactivées)\n' "$nom"
    else
      rouge "$nom est VIDE dans le conteneur (lu dans $ou)"
    fi
  done <<< "$sortie"
  [ "$vus" = 6 ] && vert "les SIX secrets ont été examinés dans le conteneur" \
                 || rouge "seulement $vus secret(s) examiné(s) — attendu 6"
  refus="$(printf '%s\n' "$sortie" | sed -n 's/^REFUS|//p')"
  [ "$refus" = 0 ] && vert "refusDesSecrets → 0 refus, sur l'environnement RÉEL" \
                   || rouge "refusDesSecrets → $refus refus"
fi

# ── ⭐ CONTRÔLE NÉGATIF ④ — un secret passé SOUS SON NOM
#
# ⚠ CELUI-CI D'ABORD, et l'ordre n'est pas un détail : il ne touche pas la base,
# donc il n'invalide rien pour la suite. Le contrôle ⑤ doit, lui, RECRÉER toute
# la pile — voir son motif.
titre "④ contrôle négatif — un JWT_SECRET trop court doit REFUSER"
# ⚠ La valeur faible est ENGENDRÉE, pas écrite : 8 caractères hexadécimaux,
# donc sous le minimum de 32. Le garde de publication a refusé le littéral
# `trop_court`, et il avait raison — la règle ne se module pas selon la valeur.
COURT="$(openssl rand -hex 4)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$COURT|" "$ENVF"
dc up -d --force-recreate --no-deps api >/dev/null 2>&1 || true
sleep 8
j4="$(dc logs --no-color api 2>/dev/null | tail -40)"
if printf '%s' "$j4" | grep -q "REFUS DE DÉMARRER"; then
  vert "l'API REFUSE, et AVANT les migrations (le refus précède « Application des migrations »)"
  printf '%s' "$j4" | grep -o "JWT_SECRET[^\"]*" | head -1 | sed 's/^/      /'
  printf '%s' "$j4" | grep -q "Application des migrations" \
    && rouge "les migrations ont été TENTÉES malgré le refus" \
    || vert "⭐ aucune migration tentée — un contrôle de configuration passe avant tout accès à la base"
else
  rouge "l'API n'a PAS refusé un JWT_SECRET trop court"
  printf '%s' "$j4" | tail -12 | sed 's/^/      /'
fi
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 24)|" "$ENVF"

# ── ⭐ CONTRÔLE NÉGATIF ⑤ — le mot de passe de la BASE, et il faut TOUT recréer
#
# 🔴 MA PREMIÈRE VERSION DE CE CONTRÔLE ÉTAIT FAUSSE PAR CONSTRUCTION, et elle a
# rendu un rouge que j'ai failli lire comme un défaut du produit.
#
# Elle changeait `POSTGRES_PASSWORD` dans le `.env.prod` puis recréait l'api
# SEULE. Or PostgreSQL fixe son mot de passe à l'INITIALISATION du volume :
# changer la variable après coup désynchronise l'URL de l'app du mot de passe
# RÉEL de la base. Le conteneur rendait donc
#
#     Error: P1000: Authentication failed against database server at `db`
#
# — une panne d'AUTHENTIFICATION, pas le refus qu'on voulait mesurer. Et le
# contrôle suivant en héritait, la base restant inaccessible.
#
# ⚠ C'est « le jeu d'essai n'atteint pas le chemin » : la mutation avait bien
# lieu, le code muté s'exécutait, et le cas éprouvé n'était jamais atteint.
#
# La forme juste recrée la pile ENTIÈRE avec un mot de passe faible dès
# l'initialisation : la base et l'app s'accordent, les migrations peuvent passer,
# et c'est bien notre refus qui doit parler.
titre "⑤ contrôle négatif — un mot de passe de BASE faible doit REFUSER"
dc down -v >/dev/null 2>&1 || true
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=change_me_svp|" "$ENVF"
dc up -d api >/dev/null 2>&1 || true
sleep 10
j5="$(dc logs --no-color api 2>/dev/null | tail -40)"
if printf '%s' "$j5" | grep -q "REFUS DE DÉMARRER"; then
  vert "l'API REFUSE sur le mot de passe de la base"
  printf '%s' "$j5" | grep -o "POSTGRES_PASSWORD[^\"]*" | head -1 | sed 's/^/      /'
  printf '%s' "$j5" | grep -q "DATABASE_URL" \
    && vert "⭐ et il dit OÙ il l'a lu — DATABASE_URL, que le conteneur reçoit" \
    || rouge "le refus ne dit pas où la valeur a été lue : l'opérateur chercherait dans .env.prod, où elle est bonne"
  printf '%s' "$j5" | grep -q "P1000" \
    && rouge "une tentative de connexion a eu lieu malgré le refus" \
    || vert "⭐ aucun P1000 — le refus a précédé tout accès à la base"
else
  rouge "l'API n'a PAS refusé un mot de passe de base faible"
  printf '%s' "$j5" | tail -14 | sed 's/^/      /'
fi

# ── Nettoyage, et on le MESURE
titre "nettoyage, par DIFFÉRENCE d'ensembles"
dc down -v --remove-orphans >/dev/null 2>&1 || true
vol_restants="$(comm -13 <(printf '%s\n' "$VOL_AVANT") <(docker volume ls -q | LC_ALL=C sort) | tr '\n' ' ')"
cnt_restants="$(comm -13 <(printf '%s\n' "$CNT_AVANT") <(docker ps -aq | LC_ALL=C sort) | tr '\n' ' ')"
[ -z "$(printf '%s' "$vol_restants" | tr -d ' ')" ] && vert "aucun volume en plus du recensement de départ" \
  || rouge "volumes restants : $vol_restants"
[ -z "$(printf '%s' "$cnt_restants" | tr -d ' ')" ] && vert "aucun conteneur en plus du recensement de départ" \
  || rouge "conteneurs restants : $cnt_restants"

titre "RAPPORT"
if [ "$ECHECS" -eq 0 ]; then
  echo "  ✅ Les secrets sont contrôlés sur CE QUE LE CONTENEUR REÇOIT,"
  echo "     et mesuré en démarrant l'api PAR LE COMPOSE DE PRODUCTION."
  exit 0
fi
echo "  🔴 $ECHECS contrôle(s) en échec."
exit 1
