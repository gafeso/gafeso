#!/usr/bin/env bash
#
# RÉPÉTITION DE LA BASCULE PAR LA VOIE CONTENEURISÉE — sans node sur l'hôte,
# sans AUCUN port publié, adresses internes (noms de service) uniquement.
#
# ⚠ Posée le 16 octobre 2026, après que la bascule réelle a été SUSPENDUE :
# le serveur de démonstration n'a ni `node` sur l'hôte, ni les ports 9000/3900
# publiés — exactement ce que la procédure d'origine supposait. Ce script
# reproduit cette absence (volontairement AUCUN `-p` sur les conteneurs S3)
# avant de déclarer la voie conteneurisée praticable.
#
# Ce que ceci prouve, et ce qu'il ne prouve pas :
#   · prouve : `docker compose run --no-deps --entrypoint node` sur le
#     service `api` atteint un MinIO et un Garage par leur nom de service
#     Docker, copie, vérifie au SHA-256, bascule la configuration ;
#   · prouve : le garde « zéro objet examiné » et le garde « extrémité
#     INJOIGNABLE » (nommant laquelle) mordent aussi par cette voie ;
#   · NE PROUVE PAS le comportement sur un hôte précis (pare-feu, espace
#     disque, nom réel du conteneur hérité) — c'est à l'exploitant de le
#     confirmer sur SA machine avant de suivre DEPLOY.md pour de vrai.
#
set -uo pipefail
cd "$(dirname "$0")/../.." || { echo "racine introuvable"; exit 1; }

PROJET=recette-conteneurise
NET="${PROJET}_default"
IMAGE_MINIO="bitnamilegacy/minio@sha256:faf554135d50ff8b382f79df7795e080726cb2d6f4ce7f056d733a6437546f6a"
ENVFILE=$(mktemp)
ECHECS=0
vert()  { printf '  \033[0;32mOK\033[0m   %s\n' "$1"; }
rouge() { printf '  \033[0;31mECHEC\033[0m %s\n' "$1"; ECHECS=$((ECHECS+1)); }
titre() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
RUN() { docker compose -p "$PROJET" -f docker/docker-compose.prod.yml --env-file "$ENVFILE" "$@"; }

nettoyer() {
  RUN down -v --remove-orphans >/dev/null 2>&1
  docker rm -f "${PROJET}-minio-ancien" "${PROJET}-vide-a" "${PROJET}-vide-b" >/dev/null 2>&1
  docker volume rm -f "${PROJET}-minio-ancien" "${PROJET}-vide-a" "${PROJET}-vide-b" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  rm -f "$ENVFILE"
}
trap nettoyer EXIT

titre "un .env.prod jetable — chaque variable requise du compose, une fois"
cat > "$ENVFILE" <<EOF
COMPOSE_PROJECT_NAME=$PROJET
POSTGRES_USER=gafeso
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=gafeso
MEILI_MASTER_KEY=$(openssl rand -hex 16)
MINIO_ROOT_USER=GK$(openssl rand -hex 12)
MINIO_ROOT_PASSWORD=$(openssl rand -hex 32)
GARAGE_RPC_SECRET=$(openssl rand -hex 32)
GARAGE_ADMIN_TOKEN=$(openssl rand -hex 32)
APP_URL=https://app.test.interne
API_DOMAIN=api.test.interne
STORAGE_DOMAIN=storage.test.interne
PUBLIC_DOMAIN=app.test.interne
MINIO_PUBLIC_URL=https://storage.test.interne
CORS_ORIGINS=https://app.test.interne
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_API_KEY=$(openssl rand -hex 16)
ACME_EMAIL=test@test.interne
OFFLINE_CONTENT_KEK=$(openssl rand -base64 32)
OFFLINE_LICENSE_PRIVATE_KEY=change_me_non_lue_par_cette_voie
GAFESO_VERSION=recette-test
GAFESO_COMMIT=0000000
EOF
vert "22 variables posées"

titre "construction des images (api sert aussi la voie de migration)"
if RUN build --build-arg GAFESO_VERSION=recette-test --build-arg GAFESO_COMMIT=0000000 garage-init api >/tmp/build-$$.log 2>&1; then
  vert "images construites"
else
  rouge "construction en échec"; tail -20 /tmp/build-$$.log; rm -f /tmp/build-$$.log; exit 1
fi
rm -f /tmp/build-$$.log

titre "la cible : Garage, initialisé par son API d'administration"
RUN up -d garage garage-init >/dev/null 2>&1
# ⚠ Attendre que GARAGE soit healthy ne suffit pas : garage-init ne DÉMARRE
# qu'à ce moment-là (depends_on: service_healthy) et prend encore un peu de
# temps pour appeler l'API d'administration. Ce qu'il faut attendre est la
# FIN de garage-init lui-même (son conteneur passe à "exited"), pas celle de
# son préalable — sinon on lit ses journaux avant qu'il ait eu le temps d'y
# écrire quoi que ce soit, et un succès se lit comme un échec.
for _ in $(seq 1 30); do
  ETAT="$(docker inspect -f '{{.State.Status}}' "${PROJET}-garage-init-1" 2>/dev/null)"
  [ "$ETAT" = "exited" ] && break
  sleep 1
done
if RUN logs garage-init 2>&1 | grep -q "initialisation terminee"; then
  vert "garage initialisé"
else
  rouge "garage-init n'a pas terminé (état observé : ${ETAT:-inconnu})"; RUN logs garage-init 2>&1 | sed 's/^/      /'; exit 1
fi

titre "l'ANCIEN MinIO, laissé en service — AUCUN port publié (comme sur le serveur réel)"
MDP_ANCIEN=$(openssl rand -hex 16)
docker volume create "${PROJET}-minio-ancien" >/dev/null
docker run -d --name "${PROJET}-minio-ancien" --network "$NET" --network-alias minio \
  -e MINIO_ROOT_USER=ancien -e "MINIO_ROOT_PASSWORD=$MDP_ANCIEN" \
  -v "${PROJET}-minio-ancien:/bitnami/minio/data" --user 1001 "$IMAGE_MINIO" >/dev/null
# ⚠ Un `sleep` fixe avait laissé passer un ECONNREFUSED intermittent — bitnami
# minio n'est pas forcément prêt à l'instant où le conteneur DÉMARRE. On
# attend sa PROPRE sonde de vie, par la même voie conteneurisée (aucun port
# publié à poller depuis l'hôte).
for _ in $(seq 1 30); do
  RUN run --rm --no-deps --entrypoint wget api -q -T 3 -O /dev/null \
    "http://minio:9000/minio/health/live" 2>/dev/null && break
  sleep 1
done
PORTS=$(docker port "${PROJET}-minio-ancien" 2>/dev/null)
if [ -z "$PORTS" ]; then
  vert "ancien MinIO en service, zéro port publié sur l'hôte"
else
  rouge "un port est publié : $PORTS — ce n'est pas le scénario à éprouver"
fi

titre "semis du fonds source, PAR LA VOIE CONTENEURISÉE (aucun node hôte)"
if RUN run --rm --no-deps --entrypoint node \
    -e SONDE_SOURCE=http://minio:9000 -e SONDE_SRC_CLE=ancien -e SONDE_SRC_SECRET="$MDP_ANCIEN" \
    api scripts/recette/garage-semer-source.mjs >/tmp/semis-$$.log 2>&1; then
  vert "fonds semé : $(grep -oE '[0-9]+ objets' /tmp/semis-$$.log)"
else
  rouge "semis en échec"; cat /tmp/semis-$$.log | sed 's/^/      /'; rm -f /tmp/semis-$$.log; exit 1
fi
rm -f /tmp/semis-$$.log

CLE=$(grep '^MINIO_ROOT_USER=' "$ENVFILE" | cut -d= -f2)
SEC=$(grep '^MINIO_ROOT_PASSWORD=' "$ENVFILE" | cut -d= -f2)

titre "VÉRIFICATION SEULE, par 'docker compose run', adresses INTERNES"
if RUN run --rm --no-deps --entrypoint node \
    -e MINIO_SOURCE_URL=http://minio:9000 -e MINIO_SOURCE_KEY=ancien -e MINIO_SOURCE_SECRET="$MDP_ANCIEN" \
    -e GARAGE_S3_URL=http://garage:3900 -e GARAGE_KEY="$CLE" -e GARAGE_SECRET="$SEC" \
    -e STORAGE_PUBLIC_DOMAIN=storage.test.interne \
    api scripts/migration-minio-vers-garage.mjs --verifier-seulement >/tmp/v0-$$.log 2>&1; then
  rouge "la vérification a ACCEPTÉ avant toute copie — elle ne discrimine pas"
else
  N=$(grep -c "MANQUANT" /tmp/v0-$$.log)
  [ "$N" -gt 0 ] && vert "refuse avant copie, en nommant $N objet(s) manquant(s) — adresses internes jointes" \
                  || { rouge "refuse, mais pas pour les bonnes raisons :"; grep -E "^REFUS" /tmp/v0-$$.log | sed 's/^/      /'; }
fi
rm -f /tmp/v0-$$.log

titre "LA MIGRATION RÉELLE, par la même voie, .env.prod fictif à l'intérieur du conteneur"
RESULT=$(RUN run --rm --no-deps --entrypoint sh api -c '
  printf "MINIO_ROOT_USER=ancien\nMINIO_ROOT_PASSWORD=xxx\nAUTRE_LIGNE=intacte\n" > /tmp/.env.test
  MINIO_SOURCE_URL=http://minio:9000 MINIO_SOURCE_KEY=ancien MINIO_SOURCE_SECRET="'"$MDP_ANCIEN"'" \
  GARAGE_S3_URL=http://garage:3900 GARAGE_KEY="'"$CLE"'" GARAGE_SECRET="'"$SEC"'" \
  STORAGE_PUBLIC_DOMAIN=storage.test.interne \
  API_HEALTH_URL=http://api-absente-expres:4000/health \
  ENV_FILE=/tmp/.env.test \
  node scripts/migration-minio-vers-garage.mjs --migrer --confirmation=storage.test.interne
  echo "---"; cat /tmp/.env.test
' 2>&1)
if echo "$RESULT" | grep -q "^ecarts : 0$\|ecarts : 0 ;"; then :; fi
if echo "$RESULT" | grep -qE "verifies cle\+taille\+SHA-256 : [0-9]+ ; ecarts : 0"; then
  vert "migration : $(echo "$RESULT" | grep -oE 'verifies cle\+taille\+SHA-256 : [0-9]+ ; ecarts : 0')"
else
  rouge "la migration n'a pas vérifié sans écart :"; echo "$RESULT" | tail -10 | sed 's/^/      /'
fi
echo "$RESULT" | grep -q "^AUTRE_LIGNE=intacte$" \
  && vert "les lignes étrangères de .env.prod sont INTACTES" || rouge "une ligne étrangère a été perdue"

titre "LE GARDE « ZÉRO OBJET » — mord-il aussi par cette voie ?"
docker volume create "${PROJET}-vide-a" >/dev/null; docker volume create "${PROJET}-vide-b" >/dev/null
docker run -d --name "${PROJET}-vide-a" --network "$NET" --network-alias vide-a \
  -e MINIO_ROOT_USER=vide -e MINIO_ROOT_PASSWORD=videvidevidevide1234 \
  -v "${PROJET}-vide-a:/bitnami/minio/data" --user 1001 "$IMAGE_MINIO" >/dev/null
docker run -d --name "${PROJET}-vide-b" --network "$NET" --network-alias vide-b \
  -e MINIO_ROOT_USER=vide -e MINIO_ROOT_PASSWORD=videvidevidevide1234 \
  -v "${PROJET}-vide-b:/bitnami/minio/data" --user 1001 "$IMAGE_MINIO" >/dev/null
sleep 3
RUN run --rm --no-deps --entrypoint node api -e "
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { clientS3 } from './scripts/lib/objets-s3.mjs';
for (const [url,key,sec] of [['http://vide-a:9000','vide','videvidevidevide1234'], ['http://vide-b:9000','vide','videvidevidevide1234']]) {
  const c = clientS3(url, key, sec);
  for (const b of ['digital-copies','covers']) { try { await c.send(new CreateBucketCommand({Bucket:b})); } catch(e){} }
}
" >/dev/null 2>&1
Z=$(RUN run --rm --no-deps --entrypoint node \
    -e MINIO_SOURCE_URL=http://vide-a:9000 -e MINIO_SOURCE_KEY=vide -e MINIO_SOURCE_SECRET=videvidevidevide1234 \
    -e GARAGE_S3_URL=http://vide-b:9000 -e GARAGE_KEY=vide -e GARAGE_SECRET=videvidevidevide1234 \
    -e STORAGE_PUBLIC_DOMAIN=covers \
    api scripts/migration-minio-vers-garage.mjs --verifier-seulement 2>&1)
echo "$Z" | grep -q "AUCUN objet examine" \
  && vert "zéro objet des deux côtés → REFUS nommé, par la voie conteneurisée" \
  || { rouge "le garde zéro-objet n'a pas mordu :"; echo "$Z" | tail -5 | sed 's/^/      /'; }

titre "LE GARDE « INJOIGNABLE » — nomme-t-il la bonne extrémité ?"
S=$(RUN run --rm --no-deps --entrypoint node \
    -e MINIO_SOURCE_URL=http://minio-qui-n-existe-pas:9000 -e MINIO_SOURCE_KEY=x -e MINIO_SOURCE_SECRET=x \
    -e GARAGE_S3_URL=http://garage:3900 -e GARAGE_KEY="$CLE" -e GARAGE_SECRET="$SEC" \
    -e STORAGE_PUBLIC_DOMAIN=storage.test.interne \
    api scripts/migration-minio-vers-garage.mjs --verifier-seulement 2>&1)
echo "$S" | grep -q "la SOURCE (MinIO) est INJOIGNABLE" \
  && vert "source fausse → refuse en nommant la SOURCE" || rouge "ne nomme pas la source fausse"
D=$(RUN run --rm --no-deps --entrypoint node \
    -e MINIO_SOURCE_URL=http://minio:9000 -e MINIO_SOURCE_KEY=ancien -e MINIO_SOURCE_SECRET="$MDP_ANCIEN" \
    -e GARAGE_S3_URL=http://garage-fantome:3900 -e GARAGE_KEY="$CLE" -e GARAGE_SECRET="$SEC" \
    -e STORAGE_PUBLIC_DOMAIN=storage.test.interne \
    api scripts/migration-minio-vers-garage.mjs --verifier-seulement 2>&1)
echo "$D" | grep -q "la CIBLE (Garage) est INJOIGNABLE" \
  && vert "cible fausse → refuse en nommant la CIBLE" || rouge "ne nomme pas la cible fausse"

echo ""
if [ "$ECHECS" -eq 0 ]; then
  printf '\033[1;32mTOUT PASSE\033[0m — la voie conteneurisée est praticable, zéro port publié, zéro node hôte.\n'
else
  printf '\033[1;31m%d ÉCHEC(S)\033[0m\n' "$ECHECS"
fi
exit "$ECHECS"
