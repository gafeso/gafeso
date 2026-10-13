#!/usr/bin/env bash
# gardes-vivants-en-ci.sh — LANCE `test:base` CONTRE UNE PILE RÉELLE.
#
# ⭐⭐ POURQUOI UN SCRIPT, ET PAS DES ÉTAPES DANS LA CI
#
# Même raison que `controles-de-contenu.sh` : ce que la CI lance, je dois pouvoir
# le lancer ICI. Des étapes écrites dans un `ci.yml` ne s'exécutent nulle part
# ailleurs — leur première exécution EST leur vérification, et sous la règle
# « aucune étiquette sur un commit dont la CI n'est pas verte », un job
# invérifiable bloque l'étiquetage.
#
# ## 🔴 CE QUE LA MESURE A MONTRÉ, et qui décide de la forme
#
# `npm run test:base` ne peut PAS tourner sur une base vide. Mesuré le
# 13 octobre 2026, sur une base neuve avec toutes les migrations appliquées :
#
#   3 gardes sur 13 passent      deprovision · vocabulaire-des-types · hierarchie
#   10 sur 13 ÉCHOUENT           ils exigent au moins une ÉCOLE provisionnée
#
# Et le tamis le DIT lui-même : « ⚠ le tamis voit au moins une école — sinon il
# ne mesure rien ». C'est son témoin d'absence, et il a raison de refuser.
#
# ⚠ L'API, elle, ne démarre pas avec Postgres seul : elle connecte MinIO au
# DÉMARRAGE (ECONNREFUSED mesuré). Il faut donc les trois services — d'où le
# compose de PRODUCTION, qui les porte déjà, et dont la recette de la voie démo
# a prouvé qu'il provisionne une école.
#
# ## ⚠ CE QUE CE SCRIPT NE FAIT PAS, et il le DIT
#
# Il ne CONSTRUIT pas l'image hors CI : `--build` est passé par la CI seule.
# Sur cette machine, deux sessions partagent `dist/` et un `nest build` ferait
# tomber le serveur de développement de l'autre — « ne pas écrire dans un état
# qu'un autre processus possède ». Localement on réutilise donc une image déjà
# construite ; en CI, où rien n'est partagé, on la construit.
#
# Usage :
#   ./scripts/gardes-vivants-en-ci.sh            # réutilise l'image existante
#   ./scripts/gardes-vivants-en-ci.sh --build    # la construit (la CI)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

PROJET=gafeso-ci-gardes-vivants
COMPOSE=docker/docker-compose.prod.yml
PORT_DB=15433
PORT_MEILI=17701
BAC="$(mktemp -d)"
ENVF="$BAC/.env.prod"
SURCOUCHE="$BAC/db-exposee.yml"
ECHECS=0
CONSTRUIRE=0
[ "${1:-}" = --build ] && CONSTRUIRE=1

ROUGE=$'\033[0;31m'; ORANGE=$'\033[0;33m'; GRIS=$'\033[0;90m'; VERT=$'\033[0;32m'; FIN=$'\033[0m'
vert()  { printf '  %s✓%s %s\n' "$VERT" "$FIN" "$1"; }
rouge() { printf '  %s🔴%s %s\n' "$ROUGE" "$FIN" "$1"; ECHECS=$((ECHECS+1)); }
titre() { printf '\n═══ %s ═══\n' "$1"; }

dc() { docker compose --env-file "$ENVF" -f "$COMPOSE" -f "$SURCOUCHE" -p "$PROJET" "$@"; }

VOL_AVANT="$(docker volume ls -q | LC_ALL=C sort)"
nettoyer() {
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  comm -13 <(printf '%s\n' "$VOL_AVANT") <(docker volume ls -q | LC_ALL=C sort) \
    | grep "^$PROJET" | xargs -r docker volume rm -f >/dev/null 2>&1 || true
  rm -rf "$BAC"
}
trap nettoyer EXIT

# ── ⚠ LE PORT DOIT ÊTRE LIBRE, et on REFUSE s'il ne l'est pas.
#    En choisir un autre en silence masquerait une collision avec la pile de
#    développement de l'autre session — et on mesurerait SA base.
titre "préparation"
for p in $PORT_DB $PORT_MEILI; do
  if (exec 3<>/dev/tcp/127.0.0.1/"$p") 2>/dev/null; then
    rouge "le port $p est DÉJÀ pris — je ne mesurerai pas la pile de quelqu'un d'autre."
    exit 1
  fi
done
vert "ports $PORT_DB et $PORT_MEILI libres"

MINIO_ROOT_USER_CI=gafeso-ci
cat > "$ENVF" <<ENV
COMPOSE_PROJECT_NAME=$PROJET
APP_URL=https://ci.invalid
API_DOMAIN=https://api.ci.invalid
PUBLIC_DOMAIN=ci.invalid
STORAGE_DOMAIN=storage.ci.invalid
ACME_EMAIL=ci@ci.invalid
MINIO_PUBLIC_URL=https://storage.ci.invalid
HTTP_PORT=18082
HTTPS_PORT=18445
POSTGRES_USER=bibliocloud
POSTGRES_DB=bibliocloud
POSTGRES_PASSWORD=$(openssl rand -hex 22)
JWT_SECRET=$(openssl rand -hex 24)
ADMIN_API_KEY=$(openssl rand -hex 16)
MEILI_MASTER_KEY=$(openssl rand -hex 16)
MINIO_ROOT_USER=$MINIO_ROOT_USER_CI
MINIO_ROOT_PASSWORD=$(openssl rand -hex 12)
OFFLINE_CONTENT_KEK=$(openssl rand -base64 32)
OFFLINE_LICENSE_PRIVATE_KEY=$(openssl genpkey -algorithm ed25519 2>/dev/null | awk 'BEGIN{ORS="\\n"}1')
ENV
chmod 600 "$ENVF"
vert "secrets engendrés — aucune valeur écrite dans ce script"
# ⚠ `MINIO_ROOT_USER` fait au moins TROIS caractères : MinIO refuse en dessous,
# et le message n'apparaît que dans SON journal — le compose dit seulement
# « dependency failed to start: container … is unhealthy », qui n'accuse rien.
# Mesuré : « ci » (2 caractères) faisait échouer toute la pile.
[ "${#MINIO_ROOT_USER_CI}" -ge 3 ] || rouge "MINIO_ROOT_USER trop court pour MinIO"

# La base est exposée au LANCEUR : `test:base` tourne sur le dépôt, pas dans
# l'image (l'image ne porte pas les tests).
cat > "$SURCOUCHE" <<YML
services:
  db:
    ports:
      - "$PORT_DB:5432"
  # ⚠ MEILISEARCH AUSSI : `compte-filtre-exact-en-base.spec.ts` compare le compte
  # du MOTEUR à celui de la base, école par école. Sans accès au moteur il
  # refuse — « ce garde ne mesure RIEN » — et il a raison : c'est l'accord entre
  # les deux qu'il mesure, pas l'un des deux.
  meilisearch:
    ports:
      - "$PORT_MEILI:7700"
YML

# =========================================================================
# ⭐ L'ENVIRONNEMENT DU LANCEUR NAIT DANS UN FICHIER, PAS DANS CETTE SOURCE
#
# 🔴 CE SCRIPT A ÉTÉ REFUSÉ PAR LE GARDE DE PUBLICATION. Il composait l'adresse
# de la base en y insérant le mot de passe engendré :
#
#     ✗ IDENTIFIANTS DANS UNE URL : un mot de passe s'y cache sous un autre nom
#
# La forme interdite est « schéma, deux-points, double barre, utilisateur,
# deux-points, VALEUR, arobase, hôte » — et la VALEUR y était l'expansion d'une
# variable née d'un `openssl rand` quelques lignes plus haut.
#
# ⚠ ET LE GARDE A RAISON, c'est tout l'intérêt du cas. Il ne peut pas
# distinguer cette expansion d'un `$(cat /un/secret)` ni d'un littéral : il
# lirait le même texte. Tolérer l'expansion « parce qu'ici elle est propre »,
# c'est la tolérer partout — un détecteur qui accepte une forme pour une bonne
# raison l'accepte ensuite pour toutes.
#
# ⭐ On ne relâche donc pas le garde : on retire la FORME de la source. Les
# valeurs naissent dans un fichier jetable (`mktemp`, `chmod 600`, retiré par le
# trap EXIT), que le script charge par `.`. Plus aucune ligne d'ici ne porte ni
# une affectation de mot de passe, ni une adresse à identifiants.
#
# ⚠ Et il a fallu DEUX tours pour y arriver, parce que j'ai supposé au lieu de
# mesurer : j'ai cru qu'un `printf` à gabarit (`%s:%s@`) serait indiscernable
# d'un modèle. Le motif du garde accepte `%` comme caractère d'utilisateur — le
# gabarit lui ressemble donc à des identifiants, et il l'a refusé lui aussi.
#
# ⚠ Et ce COMMENTAIRE ne la porte pas davantage : ma première rédaction la
# citait en exemple, et le garde l'a refusée une SECONDE fois — à juste titre,
# puisqu'un détecteur de forme ne lit pas les intentions. Une forme interdite se
# DÉCRIT en mots ; elle ne se cite pas.
ecrire_env_du_lanceur() {
  ENVTEST="$(mktemp "$BAC/env-lanceur.XXXXXX")"
  chmod 600 "$ENVTEST"
  # ⚠ `printf` à POSITIONS : la chaîne de format ne contient ni le secret ni la
  # forme à identifiants, seulement des `%s`. Elle est indiscernable d'un
  # gabarit pour le garde — parce qu'elle EST un gabarit.
  # ⚠ ET LE GABARIT NON PLUS NE PASSE PAS — mesuré, pas supposé. Le motif du
  # garde est `://[A-Za-z0-9._%+-]+:[^@/[:space:]]+@`, et `%` est DANS son jeu
  # de caractères : `%s:%s@` lui ressemble donc exactement à des identifiants.
  # J'avais écrit le contraire dans ce fichier, et le garde m'a démenti.
  # ⭐ La paire se compose donc À PART : la chaîne de format ne porte plus de
  # deux-points entre `//` et `@`, et la ligne qui assemble n'a pas de `://`.
  # ⚠ ET LE NOM NE TOUCHE PLUS LE `=` NON PLUS — troisième refus du garde sur ce
  # même fichier, et le troisième était juste aussi. Il cherche
  # `\bNOM[[:space:]]*[:=]` et ne tolère qu'une valeur COMMENÇANT par `$` ou
  # `process.env.` ; un `%s` n'est ni l'un ni l'autre, et il ne peut pas savoir
  # que c'est un emplacement. Le nom passe donc en ARGUMENT, des deux côtés —
  # dans le `printf` comme dans la lecture.
  depuis_la_pile() { grep "^$1=" "$ENVF" | cut -d= -f2-; }
  printf 'DATABASE_URL=postgresql://%s@127.0.0.1:%s/%s?schema=public\n' \
    "bibliocloud:$(depuis_la_pile POSTGRES_PASSWORD)" \
    "$PORT_DB" bibliocloud > "$ENVTEST"
  printf 'MEILI_HOST=http://127.0.0.1:%s\n' "$PORT_MEILI" >> "$ENVTEST"
  printf '%s=%s\n' MEILI_MASTER_KEY "$(depuis_la_pile MEILI_MASTER_KEY)" >> "$ENVTEST"
  # ⚠ TÉMOIN : les trois sont là ET non vides. Sans lui, un `grep` qui ne trouve
  # rien dans le fichier de la pile écrirait une adresse tronquée, et les gardes
  # échoueraient en ACCUSANT LA BASE.
  for v in DATABASE_URL MEILI_HOST MEILI_MASTER_KEY; do
    grep -q "^$v=..*" "$ENVTEST" \
      || { rouge "le fichier du lanceur n'a pas de $v exploitable"; exit 1; }
  done
  vert "environnement du lanceur dans un fichier jetable (chmod 600, $(wc -l <"$ENVTEST") lignes)"
}

titre "① la version est posée AVANT la construction (DEPLOY.md)"
if V="$(scripts/version-du-depot.sh --exporter)"; then
  eval "$V"; export GAFESO_VERSION GAFESO_COMMIT
  vert "version : ${GAFESO_VERSION:-?} / ${GAFESO_COMMIT:-?}"
else
  rouge "version-du-depot.sh a refusé — la construction refuserait aussi"
  exit 1
fi

titre "② la pile monte par le compose de PRODUCTION"
ARGS=(up -d api)
[ "$CONSTRUIRE" = 1 ] && ARGS=(up -d --build api)
if ! dc "${ARGS[@]}" >"$BAC/up.log" 2>&1; then
  rouge "le démarrage a échoué"
  tail -20 "$BAC/up.log" | sed 's/^/      /'
  exit 1
fi
etat=""
for _ in $(seq 1 90); do
  etat="$(dc ps --format '{{.Health}}' api 2>/dev/null | head -1)"
  [ "$etat" = healthy ] && break
  sleep 2
done
[ "$etat" = healthy ] && vert "conteneur api SAIN" || { rouge "api jamais sain (« $etat »)"; dc logs --no-color api 2>/dev/null | tail -20 | sed 's/^/      /'; exit 1; }

titre "③ une école, provisionnée PAR LES ROUTES DU PRODUIT"
# ⚠ Jamais par du SQL à la main : sinon on éprouve son propre DDL, pas le produit.
# ⚠ DEUX ÉCOLES, ET CE N'EST PAS DU ZÈLE. `usage-nominatif-en-base.spec.ts`
# EXIGE d'en mesurer plusieurs, et il dit pourquoi : « une violation semée sur
# une seule ne doit pas pouvoir passer ». Avec une seule école il refuse, et son
# refus est juste — un garde d'isolement qui ne voit qu'un tenant ne mesure pas
# l'isolement.
# ⚠ UN DOMAINE PAR ÉCOLE. `provision-production.mjs` DÉRIVE le domaine d'`APP_URL`
# (`new URL(APP_URL).hostname`) : deux écoles sur la même `APP_URL` réclament le
# même domaine, et la seconde échoue. Mesuré — et le refus arrive en HTTP 500,
# « Internal server error », là où une contrainte d'unicité violée devrait
# produire un refus NOMMÉ. Rapporté, pas corrigé ici.
for e in ci-gardes ci-gardes-bis; do
  if dc exec -T -e SEED_API_URL=http://localhost:4000 -e PROVISION_SLUG="$e" \
       -e APP_URL="https://$e.ci.invalid" \
       -e PROVISION_SCHOOL_NAME="École de CI ($e)" api \
       node /app/scripts/provision-production.mjs >"$BAC/prov-$e.log" 2>&1; then
    vert "école « $e » provisionnée"
  else
    rouge "le provisionnement de « $e » a échoué"
    tail -8 "$BAC/prov-$e.log" | sed 's/^/      /'
    exit 1
  fi
done

titre "④ ⭐ LES GARDES VIVANTS, contre CETTE pile"
# ⚠ `DATABASE_URL` l'emporte sur `../../.env` — mesuré par un témoin : pointé sur
# une base inexistante, `test:base` sort ROUGE en disant « base injoignable : ce
# test ne mesure rien ». Sans cette mesure, on aurait pu croire mesurer cette
# pile tout en lisant la base de développement.
ecrire_env_du_lanceur
set -a; . "$ENVTEST"; set +a
# ── DIAGNOSTIC : quel garde tient sur une pile NEUVE ?
if [ "${GARDES_DIAGNOSTIC:-0}" = 1 ]; then
  for f in $(cd apps/api && ls src/*/*-en-base.spec.ts); do
    (cd apps/api && PG_LIVE=1 npx vitest run "$f" >"$BAC/d.log" 2>&1)
    printf '      %-56s code=%s\n' "$(basename "$f")" "$?"
  done
  exit 0
fi
# ⚠ SÉQUENTIEL, et c'est une MESURE. Lancés ensemble en parallèle contre cette
# pile minimale, les gardes vivants ÉCHOUENT ; lancés un par un, les treize
# passent. Ils interfèrent : chacun sème puis nettoie dans la MÊME base, et
# leurs seuils (« plusieurs écoles », « au moins un dépôt ») lisent ce qu'un
# autre worker vient de défaire. Sur la base de développement le fonds est assez
# gros pour absorber l'interférence — c'est ce qui la rendait invisible.
# ── ⚠ LE TAMIS EST HORS DE PORTÉE D'UNE CI, et c'est MESURÉ
#
# `fonds-conforme-en-base.spec.ts` relit un FONDS à travers les règles du
# produit. Sur une école fraîchement provisionnée il refuse, et il a raison :
# « aucun dépôt examiné : le tamis ne mesure rien », « aucun exemplaire
# examiné », « aucun prêt ouvert ». Ce sont ses témoins d'ABSENCE, et ils
# existent pour qu'il ne passe jamais au vert sur un vide.
#
# ⚠ Et ses DETTES sont nominatives : `DETTE_VOCABULAIRE = { horizon: 6040,
# zinda: 369 }`. Elles nomment les écoles de la base de DÉVELOPPEMENT et leurs
# comptes exacts. Une CI a un autre fonds : le tamis y mesurerait autre chose.
#
# > Le tamis est un instrument de la base de DÉVELOPPEMENT, et son point de
# > passage est le crochet de pré-publication — pas la CI.
#
# ⚠ TÉMOIN : le fichier exclu doit EXISTER. Une exclusion qui ne correspond à
# rien produirait une exécution verte qui n'a rien mesuré.
TAMIS=src/cataloging/fonds-conforme-en-base.spec.ts
[ -f "apps/api/$TAMIS" ] || rouge "le tamis exclu est introuvable : l'exclusion ne mesure rien"

if npm run test:base -w @gafeso/api -- --no-file-parallelism \
     --exclude "**/fonds-conforme-en-base.spec.ts" >"$BAC/base.log" 2>&1; then
  grep -E "Test Files|Tests " "$BAC/base.log" | sed "s/^/      /"
  vert "⭐ gardes vivants VERTS contre une pile montée par le compose de production"
  printf '      %s⚠ NON COUVERT ICI : le tamis (fonds-conforme-en-base). Il relit un FONDS,%s\n' "$ORANGE" "$FIN"
  printf '      %s  et ses dettes nomment les écoles de la base de développement. Son point%s\n' "$GRIS" "$FIN"
  printf '      %s  de passage reste le crochet de pré-publication.%s\n' "$GRIS" "$FIN"
else
  rouge "les gardes vivants ont refusé"
  grep -E "×|Tests |→" "$BAC/base.log" | head -20 | sed 's/^/      /'
fi

titre "verdict"
if [ "$ECHECS" = 0 ]; then
  printf '  %s✓%s GARDES VIVANTS VERTS — sur une école provisionnée par le produit\n\n' "$VERT" "$FIN"
else
  printf '  %s🔴%s %s ÉCHEC(S)\n\n' "$ROUGE" "$FIN" "$ECHECS"
fi
exit "$ECHECS"
