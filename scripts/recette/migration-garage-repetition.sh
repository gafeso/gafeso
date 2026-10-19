#!/usr/bin/env bash
#
# REPETITION DE LA MIGRATION MinIO -> Garage, retour arriere COMPRIS.
#
# ⚠ Ce que cette repetition prouve, et ce qu'elle ne prouve pas :
#   · elle prouve que le script copie, verifie, bascule, et que le retour
#     arriere RESTAURE la configuration d'origine ;
#   · elle NE prouve PAS le comportement sur les donnees reelles d'une
#     instance en service. Pour cela il faut une copie du volume, et c'est
#     l'exploitant qui l'exporte — voir DEPLOY.md.
#
set -uo pipefail
cd "$(dirname "$0")/../.." || { echo "racine introuvable"; exit 1; }

PROJET=migration-recette
PORT_MINIO=19221 PORT_S3=19222 PORT_WEB=19223 PORT_ADMIN=19224
IMAGE_MINIO="bitnamilegacy/minio@sha256:faf554135d50ff8b382f79df7795e080726cb2d6f4ce7f056d733a6437546f6a"
IMAGE_GARAGE="dxflrs/garage@sha256:58e68794286868230708803e50495bfe7d1d1c7b696e0c2dee99b03c524fc960"
BAC="$(mktemp -d)"
ECHECS=0
vert()  { printf '  \033[0;32mOK\033[0m   %s\n' "$1"; }
rouge() { printf '  \033[0;31mECHEC\033[0m %s\n' "$1"; ECHECS=$((ECHECS+1)); }
gris()  { printf '  \033[0;90m...\033[0m  %s\n' "$1"; }
titre() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
nettoyer() {
  docker rm -f "$PROJET-minio" "$PROJET-garage" >/dev/null 2>&1
  docker volume rm -f "$PROJET-minio" "$PROJET-meta" "$PROJET-data" >/dev/null 2>&1
  rm -rf "$BAC"
}
trap nettoyer EXIT

for p in $PORT_MINIO $PORT_S3 $PORT_WEB $PORT_ADMIN; do
  ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN && { rouge "port $p pris"; exit 1; }
done
vert "quatre ports libres"

titre "la pile de depart : un MinIO avec un fonds"
MDP=$(openssl rand -hex 16)
docker volume create "$PROJET-minio" >/dev/null
docker run -d --name "$PROJET-minio" -p "$PORT_MINIO:9000" \
  -e MINIO_ROOT_USER=sortie -e "MINIO_ROOT_PASSWORD=$MDP" \
  -v "$PROJET-minio:/bitnami/minio/data" --user 1001 "$IMAGE_MINIO" >/dev/null
for _ in $(seq 1 40); do curl -4 -s -m 3 -o /dev/null "http://127.0.0.1:$PORT_MINIO/minio/health/live" && break; sleep 1; done
vert "MinIO en service"

titre "la pile d arrivee : Garage, initialise par son API d ADMINISTRATION"
JETON=$(openssl rand -hex 32)
cat > "$BAC/garage.toml" <<TOML
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_secret = "$(openssl rand -hex 32)"
[s3_api]
s3_region = "us-east-1"
api_bind_addr = "[::]:3900"
root_domain = ".s3.interne"
[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.interne"
index = "index.html"
[admin]
api_bind_addr = "[::]:3903"
admin_token = "$JETON"
TOML
chmod 600 "$BAC/garage.toml"
docker volume create "$PROJET-meta" >/dev/null; docker volume create "$PROJET-data" >/dev/null
docker run -d --name "$PROJET-garage" -p "$PORT_S3:3900" -p "$PORT_WEB:3902" -p "$PORT_ADMIN:3903" \
  -v "$BAC/garage.toml:/etc/garage.toml:ro" \
  -v "$PROJET-meta:/var/lib/garage/meta" -v "$PROJET-data:/var/lib/garage/data" \
  --memory=4g --memory-swap=4g "$IMAGE_GARAGE" >/dev/null
for _ in $(seq 1 30); do curl -4 -s -m 3 -o /dev/null "http://127.0.0.1:$PORT_ADMIN/health" && break; sleep 1; done
DOMAINE=couvertures.exemple.test
# ⚠ CORRIGÉ le 16 octobre 2026 : depuis le 14, garage-initialiser.mjs n'ENGENDRE
# plus de clé — il IMPORTE celle que l'exploitant a déjà posée dans
# MINIO_ROOT_USER/MINIO_ROOT_PASSWORD (voir DEPLOY.md, étape ②). Cette
# répétition appelait encore l'ancienne forme et recevait le refus nommé
# « MINIO_ROOT_USER et MINIO_ROOT_PASSWORD sont exiges » — trouvé en
# rejouant ce script le 16, sans rapport avec ce qu'on y cherchait ce jour-là.
CLE=GK$(openssl rand -hex 12)
SEC=$(openssl rand -hex 32)
if MINIO_ROOT_USER="$CLE" MINIO_ROOT_PASSWORD="$SEC" \
   GARAGE_ADMIN_URL="http://127.0.0.1:$PORT_ADMIN" GARAGE_ADMIN_TOKEN="$JETON" \
   STORAGE_PUBLIC_DOMAIN="$DOMAINE" \
   node scripts/lib/garage-initialiser.mjs > "$BAC/init.log" 2>&1; then
  vert "initialisation : $(grep -c . "$BAC/init.log") lignes, aucun geste manuel"
else
  rouge "initialisation refusee"; sed 's/^/      /' "$BAC/init.log"; exit 1
fi
# ⚠ DEUX FOIS : l'idempotence est une propriete de l'ETAT.
B1=$(curl -4 -s -m 8 -H "Authorization: Bearer $JETON" "http://127.0.0.1:$PORT_ADMIN/v1/bucket?list" | grep -o '"id"' | wc -l)
MINIO_ROOT_USER="$CLE" MINIO_ROOT_PASSWORD="$SEC" \
  GARAGE_ADMIN_URL="http://127.0.0.1:$PORT_ADMIN" GARAGE_ADMIN_TOKEN="$JETON" \
  STORAGE_PUBLIC_DOMAIN="$DOMAINE" node scripts/lib/garage-initialiser.mjs >/dev/null 2>&1
B2=$(curl -4 -s -m 8 -H "Authorization: Bearer $JETON" "http://127.0.0.1:$PORT_ADMIN/v1/bucket?list" | grep -o '"id"' | wc -l)
[ "$B1" = "$B2" ] && vert "idempotente : $B1 bucket(s) avant et apres" || rouge "l etat a change ($B1 -> $B2)"

titre "un fonds a la source, puis la VERIFICATION SEULE (aucune bascule)"
export MINIO_SOURCE_URL="http://127.0.0.1:$PORT_MINIO" MINIO_SOURCE_KEY=sortie MINIO_SOURCE_SECRET="$MDP"
export GARAGE_S3_URL="http://127.0.0.1:$PORT_S3" GARAGE_KEY="$CLE" GARAGE_SECRET="$SEC"
export SONDE_SOURCE="$MINIO_SOURCE_URL" SONDE_SRC_CLE=sortie SONDE_SRC_SECRET="$MDP"
export SONDE_CIBLE="$GARAGE_S3_URL" SONDE_DST_CLE="$CLE" SONDE_DST_SECRET="$SEC"
node scripts/recette/garage-semer-source.mjs > "$BAC/semis.log" 2>&1 \
  && vert "fonds de depart : $(grep -oE '[0-9]+ objets' "$BAC/semis.log" | head -1)" \
  || { rouge "le semis a echoue"; sed 's/^/      /' "$BAC/semis.log"; exit 1; }

# ⚠ LE TEMOIN D ABSENCE : avant toute copie, la verification doit REFUSER.
export STORAGE_PUBLIC_DOMAIN="$DOMAINE"
if node scripts/migration-minio-vers-garage.mjs --verifier-seulement > "$BAC/v0.log" 2>&1; then
  rouge "la verification a ACCEPTE une cible vide — elle ne discrimine pas"
else
  # ⚠ UN REFUS NE SUFFIT PAS : il doit refuser pour la BONNE raison. Mon premier
  # jet comptait « 0 manquants nommes » et declarait l epreuve reussie — le
  # script refusait en realite sur un bucket introuvable, ce qui est un autre
  # defaut. Un controle qui se satisfait d un code de sortie ne mesure pas.
  MANQ=$(grep -c "MANQUANT" "$BAC/v0.log")
  if [ "$MANQ" -gt 0 ]; then
    vert "verification REFUSE avant la copie, en NOMMANT $MANQ objet(s) manquant(s)"
  else
    rouge "elle refuse, mais pas pour les objets manquants :"
    grep -E "^REFUS|illisible" "$BAC/v0.log" | head -2 | sed 's/^/      /'
  fi
fi

titre "la bascule"
# ⚠ l API doit etre arretee : ici elle n existe pas, et on le DIT plutot que de
# sauter le controle — API_HEALTH_URL pointe sur un port ferme.
export API_HEALTH_URL="http://127.0.0.1:19229/health"
printf 'MINIO_ROOT_USER=sortie\nMINIO_ROOT_PASSWORD=%s\nAUTRE=garde\n' "$MDP" > "$BAC/.env.prod"
chmod 600 "$BAC/.env.prod"
cp "$BAC/.env.prod" "$BAC/.env.origine"
export ENV_FILE="$BAC/.env.prod"
if node scripts/migration-minio-vers-garage.mjs --migrer --confirmation="$DOMAINE" > "$BAC/m.log" 2>&1; then
  vert "migration : $(grep -oE 'verifies cle\+taille\+SHA-256 : [0-9]+' "$BAC/m.log")"
  grep -E '^(copies|configuration)' "$BAC/m.log" | sed 's/^/      /'
else
  rouge "migration refusee"; tail -6 "$BAC/m.log" | sed 's/^/      /'
fi

titre "ce que la bascule a ECRIT, et ce qu elle n a pas touche"
grep -qE '^STORAGE_PUBLIC_BUCKET_IN_PATH=false$' "$BAC/.env.prod" \
  && vert "le bucket quitte le chemin" || rouge "STORAGE_PUBLIC_BUCKET_IN_PATH absent"
grep -qE "^STORAGE_PUBLIC_DOMAIN=$DOMAINE$" "$BAC/.env.prod" \
  && vert "le domaine public est pose" || rouge "STORAGE_PUBLIC_DOMAIN absent"
grep -qE '^AUTRE=garde$' "$BAC/.env.prod" \
  && vert "les autres lignes sont INTACTES" || rouge "une ligne etrangere a ete perdue"
# ⚠ et la SOURCE n a pas bouge : c est elle, le retour arriere.
RESTE=$(node scripts/recette/garage-compter-source.mjs 2>/dev/null || echo 0)
[ "$RESTE" -gt 0 ] && vert "le MinIO source porte encore $RESTE objet(s)" \
                   || rouge "la source a ete videe — le retour arriere est perdu"

titre "LE RETOUR ARRIERE, eprouve"
# 🔴 MON PREMIER CONTROLE CONFIRMAIT TOUJOURS. Il recopiait la sauvegarde puis
# comparait a l origine — or si la bascule a ECHOUE, le fichier n a jamais ete
# modifie, le `cp` echoue sur un fichier absent, et la comparaison passe quand
# meme. Il a imprime « IDENTIQUE a l origine » pendant que la migration
# refusait. C est « un controle dont la reference est ce qu on vient de casser
# confirme toujours », dans un script que j ecrivais pour l eviter.
#
# ⭐ LA FORME JUSTE A TROIS TEMPS, et les deux premiers manquaient :
#   1. la SAUVEGARDE existe ;
#   2. la configuration a REELLEMENT change (sinon il n y a rien a defaire) ;
#   3. et seulement alors, la restauration rend l origine.
if [ ! -f "$BAC/.env.prod.avant-garage" ]; then
  rouge "aucune sauvegarde : le retour arriere n est pas eprouvable"
elif diff -q "$BAC/.env.prod" "$BAC/.env.origine" >/dev/null 2>&1; then
  rouge "la configuration n a PAS change : il n y a rien a defaire, donc rien a prouver"
else
  gris "la configuration a bien change — le retour arriere a quelque chose a defaire"
  cp "$BAC/.env.prod.avant-garage" "$BAC/.env.prod"
  if diff -q "$BAC/.env.prod" "$BAC/.env.origine" >/dev/null; then
    vert "retour arriere : configuration IDENTIQUE a la copie prise AVANT"
  else
    rouge "le retour arriere ne rend pas la configuration d origine"
    diff "$BAC/.env.origine" "$BAC/.env.prod" | head -4 | sed 's/^/      /'
  fi
fi

titre "verdict"
if [ "$ECHECS" = 0 ]; then vert "REPETITION DE MIGRATION VERTE"; else rouge "$ECHECS point(s)"; fi
exit $(( ECHECS > 0 ? 1 : 0 ))
