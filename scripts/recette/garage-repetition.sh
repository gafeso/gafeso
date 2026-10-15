#!/usr/bin/env bash
#
# REPETITION GARAGE sur pile JETABLE — jamais sur une instance en service.
#
# Elle repond aux six points demandes, et chacun est MESURE plutot que declare :
#   a) image epinglee par DIGEST (v1.3.1), version relue DANS le conteneur ;
#   b) initialisation ENTIEREMENT scriptee : layout, cle, buckets, alias global,
#      website pour les couvertures. Aucun geste manuel ;
#   c) migration : les objets d'un MinIO sont recopies vers Garage, puis
#      verifies UN PAR UN — nombre, taille, et somme de controle SHA-256 ;
#   d) charge : un PDF de 50 Mo televerse, relu par URL signee, et la memoire
#      mesuree sous une limite de 4 Go ;
#   e) sauvegarde et restauration PROUVEES : on detruit, on restaure, on
#      recompte.
#
# ⚠ CE QU'ELLE NE PROUVE PAS, et il faut le dire : le PDF de 50 Mo est
# ENGENDRE. Une these scannee n'a pas la meme structure, et nos objets reels
# font 84 ko au maximum. La mesure porte sur le transport, pas sur le document.
#
set -uo pipefail
# ⚠ DEUX niveaux : ce script vit dans scripts/recette/, pas dans scripts/.
# Mon premier jet remontait d'un cran et cherchait scripts/scripts/.
cd "$(dirname "$0")/../.." || { echo "racine introuvable"; exit 1; }

PROJET=garage-recette
DIGEST="sha256:58e68794286868230708803e50495bfe7d1d1c7b696e0c2dee99b03c524fc960"
IMAGE="dxflrs/garage@$DIGEST"
IMAGE_MINIO="bitnamilegacy/minio@sha256:faf554135d50ff8b382f79df7795e080726cb2d6f4ce7f056d733a6437546f6a"
PORT_S3=19201 PORT_WEB=19202 PORT_MINIO=19203
BAC="$(mktemp -d)"
ECHECS=0

vert()  { printf '  \033[0;32mOK\033[0m   %s\n' "$1"; }
rouge() { printf '  \033[0;31mECHEC\033[0m %s\n' "$1"; ECHECS=$((ECHECS+1)); }
gris()  { printf '  \033[0;90m...\033[0m  %s\n' "$1"; }
titre() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

nettoyer() {
  docker rm -f "$PROJET-garage" "$PROJET-minio" >/dev/null 2>&1
  docker volume rm -f "$PROJET-meta" "$PROJET-data" "$PROJET-minio" >/dev/null 2>&1
  rm -rf "$BAC"
}
trap nettoyer EXIT

# ⚠ Les ports se verifient AVANT : je ne mesurerai pas la pile de quelqu'un
# d'autre, et un port occupe ferait mesurer un service etranger.
for p in $PORT_S3 $PORT_WEB $PORT_MINIO; do
  if ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN; then
    rouge "le port $p est DEJA pris — repetition annulee"; exit 1
  fi
done
vert "ports $PORT_S3, $PORT_WEB et $PORT_MINIO libres"

titre "a) l'image, epinglee par DIGEST et relue DANS le conteneur"
VERSION=$(docker run --rm --entrypoint /garage "$IMAGE" --version 2>/dev/null | head -1)
case "$VERSION" in
  *"v1.3.1"*) vert "$VERSION" ;;
  *) rouge "version inattendue : $VERSION"; exit 1 ;;
esac

titre "b) initialisation ENTIEREMENT scriptee"
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
TOML
chmod 600 "$BAC/garage.toml"
docker volume create "$PROJET-meta" >/dev/null; docker volume create "$PROJET-data" >/dev/null
docker run -d --name "$PROJET-garage" \
  -p "$PORT_S3:3900" -p "$PORT_WEB:3902" \
  -v "$BAC/garage.toml:/etc/garage.toml:ro" \
  -v "$PROJET-meta:/var/lib/garage/meta" \
  -v "$PROJET-data:/var/lib/garage/data" \
  --memory=4g --memory-swap=4g "$IMAGE" >/dev/null
G() { docker exec "$PROJET-garage" /garage "$@"; }
for _ in $(seq 1 30); do G status >/dev/null 2>&1 && break; sleep 1; done
NOEUD=$(G node id -q 2>/dev/null | cut -d@ -f1)
[ -n "$NOEUD" ] || { rouge "le noeud ne repond pas"; exit 1; }
G layout assign -z dc1 -c 10G "$NOEUD" >/dev/null 2>&1
G layout apply --version 1 >/dev/null 2>&1
for _ in $(seq 1 30); do G status 2>/dev/null | grep -q HEALTHY && break; sleep 1; done
vert "noeud sain, layout applique (10 Go)"

CLE_BRUT=$(G key create recette 2>/dev/null)
CLE=$(echo "$CLE_BRUT" | grep -oE "^Key ID: .*" | awk "{print \$3}")
SEC=$(echo "$CLE_BRUT" | grep -oE "^Secret key: .*" | awk "{print \$3}")
[ -n "$CLE" ] && [ -n "$SEC" ] || { rouge "cle non creee"; exit 1; }
G key allow --create-bucket recette >/dev/null 2>&1
for b in digital-copies covers; do
  G bucket create "$b" >/dev/null 2>&1
  G bucket allow --read --write --owner "$b" --key recette >/dev/null 2>&1
done
# ⚠ L'ALIAS GLOBAL EST CE QUI MANQUAIT la premiere fois : un bucket cree par
# l'API S3 n'a qu'un alias LOCAL a la cle, et l'administration hors API ne le
# trouve pas (« several matching buckets »). Ici on cree par la CLI, donc
# l'alias global existe deja — et on nomme le bucket public par son DOMAINE.
DOMAINE_COUV="couvertures.exemple.test"
G bucket alias covers "$DOMAINE_COUV" >/dev/null 2>&1
G bucket website --allow "$DOMAINE_COUV" >/dev/null 2>&1
vert "cle, deux buckets, alias global et website : aucun geste manuel"
gris "le bucket public s'appelle $DOMAINE_COUV — le nom EST le domaine"

titre "c) migration depuis un MinIO, verifiee OBJET PAR OBJET"
MDP_MINIO=$(openssl rand -hex 16)
docker volume create "$PROJET-minio" >/dev/null
docker run -d --name "$PROJET-minio" -p "$PORT_MINIO:9000" \
  -e MINIO_ROOT_USER=sortie -e "MINIO_ROOT_PASSWORD=$MDP_MINIO" \
  -v "$PROJET-minio:/bitnami/minio/data" --user 1001 "$IMAGE_MINIO" >/dev/null
for _ in $(seq 1 40); do
  curl -4 -s -m 3 -o /dev/null "http://127.0.0.1:$PORT_MINIO/minio/health/live" && break; sleep 1
done
vert "MinIO de depart en service"

export SONDE_SOURCE="http://127.0.0.1:$PORT_MINIO" SONDE_SRC_CLE=sortie SONDE_SRC_SECRET="$MDP_MINIO"
export SONDE_CIBLE="http://127.0.0.1:$PORT_S3" SONDE_DST_CLE="$CLE" SONDE_DST_SECRET="$SEC"
export SONDE_WEB="http://127.0.0.1:$PORT_WEB" SONDE_DOMAINE="$DOMAINE_COUV"
if node scripts/recette/garage-migration.mjs; then
  vert "migration et verification objet par objet"
else
  rouge "la migration ou sa verification a echoue"
fi

titre "d) charge : 50 Mo, URL signee, et la memoire sous 4 Go"
if node scripts/recette/garage-charge.mjs; then vert "charge servie"; else rouge "charge refusee"; fi
# ⚠ LA LECTURE ANONYME NE PEUT PAS SE MESURER DEPUIS `fetch` : `Host` est un
# en-tête INTERDIT, silencieusement retiré — ce dépôt le sait depuis le
# middleware de tenant, et je l'ai quand même écrit. `curl` le pose.
CODE=$(curl -4 -sS -m 15 -o /dev/null -w '%{http_code}' \
  -H "Host: $DOMAINE_COUV" "http://127.0.0.1:$PORT_WEB/couv/0.jpg" 2>/dev/null)
if [ "$CODE" = 200 ]; then
  vert "couverture lue ANONYMEMENT par le point d'entrée web (HTTP $CODE)"
else
  rouge "lecture publique refusée (HTTP $CODE)"
fi
# et le témoin d'ABSENCE : un hôte INCONNU ne doit RIEN servir, sinon le 200
# ci-dessus ne dirait pas que le bucket est choisi par l'hôte.
CODE_X=$(curl -4 -sS -m 15 -o /dev/null -w '%{http_code}' \
  -H "Host: pas-un-bucket.exemple.test" "http://127.0.0.1:$PORT_WEB/couv/0.jpg" 2>/dev/null)
if [ "$CODE_X" = 200 ]; then
  rouge "un hôte INCONNU est servi (HTTP $CODE_X) : le choix par hôte ne discrimine pas"
else
  vert "hôte inconnu refusé (HTTP $CODE_X) — le bucket est bien choisi par l'hôte"
fi
docker stats --no-stream --format "  memoire : {{.MemUsage}}  ({{.MemPerc}} de la limite)" "$PROJET-garage"

titre "e) sauvegarde et restauration PROUVEES"
AVANT=$(node scripts/recette/garage-compter.mjs)
gris "objets avant : $AVANT"
# ⚠ UNE SAUVEGARDE D'UN DÉPÔT VIDE SE RESTAURE PARFAITEMENT, et ne prouve
# rien. Mon premier jet ne vérifiait que « le fichier n'est pas vide » : il a
# rendu 4 ko sur un dépôt sans objets, et la restauration aurait été déclarée
# juste. C'est le vert à vide, dans l'instrument qui juge une sauvegarde.
if [ -z "$AVANT" ] || [ "$AVANT" = "0" ]; then
  rouge "le dépôt est VIDE : une restauration ne prouverait rien"; exit 1
fi
# ⚠ L'IMAGE DE GARAGE EST MINIMALE : ni `sh`, ni `tar`, ni busybox — mesuré.
# Mon premier jet faisait `docker exec garage sh -c "tar cf -"`, ce qui a rendu
# une archive de 4 ko illisible (« invalid tar magic ») sans jamais lever. Une
# sauvegarde se prend donc par un conteneur AUXILIAIRE qui monte les volumes.
# ⭐ Et c'est une leçon d'exploitation, pas un détail de recette : l'exploitant
# ne peut PAS sauvegarder Garage « depuis le conteneur ».
docker stop "$PROJET-garage" >/dev/null
docker run --rm -v "$PROJET-meta:/v/meta:ro" -v "$PROJET-data:/v/data:ro" \
  alpine:3.20 tar cf - -C /v meta data > "$BAC/garage.tar" 2>/dev/null
docker start "$PROJET-garage" >/dev/null
for _ in $(seq 1 30); do G status 2>/dev/null | grep -q HEALTHY && break; sleep 1; done
# ⚠ et le contrôle porte sur le CONTENU, pas sur la taille : une archive se
# vérifie en la LISANT.
if ! docker run --rm -i alpine:3.20 tar tf - < "$BAC/garage.tar" >/dev/null 2>&1; then
  rouge "la sauvegarde n'est pas une archive lisible"; exit 1
fi
ENTREES=$(docker run --rm -i alpine:3.20 tar tf - < "$BAC/garage.tar" 2>/dev/null | wc -l)
gris "archive lisible : $ENTREES entrées"
[ "$ENTREES" -gt 10 ] || { rouge "archive suspecte ($ENTREES entrées)"; exit 1; }
gris "sauvegarde : $(du -h "$BAC/garage.tar" | cut -f1)"
# ⚠ ON DETRUIT POUR DE VRAI, sinon la restauration ne prouve rien.
docker stop "$PROJET-garage" >/dev/null
docker run --rm -v "$PROJET-data:/d" alpine:3.20 sh -c "rm -rf /d/*" >/dev/null 2>&1
docker start "$PROJET-garage" >/dev/null; sleep 6
PERDU=$(node scripts/recette/garage-compter.mjs 2>/dev/null || echo "illisible")
gris "apres destruction : $PERDU"
docker stop "$PROJET-garage" >/dev/null
# ⚠ `rm -rf meta data` ÉCHOUE : ce sont des points de MONTAGE (« Resource
# busy »). On vide leur CONTENU, caches comprises, puis on déverse l'archive.
docker run --rm -i -v "$PROJET-meta:/var/lib/garage/meta" -v "$PROJET-data:/var/lib/garage/data" \
  alpine:3.20 sh -c 'cd /var/lib/garage && rm -rf meta/* meta/.[!.]* data/* data/.[!.]* 2>/dev/null; tar xf -' \
  < "$BAC/garage.tar"
docker start "$PROJET-garage" >/dev/null
for _ in $(seq 1 30); do G status 2>/dev/null | grep -q HEALTHY && break; sleep 1; done
APRES=$(node scripts/recette/garage-compter.mjs 2>/dev/null || echo "illisible")
if [ "$APRES" = "$AVANT" ] && [ "$AVANT" != "0" ]; then
  vert "restauration prouvee : $AVANT objets avant, $APRES apres"
else
  rouge "restauration NON prouvee (avant=$AVANT perdu=$PERDU apres=$APRES)"
fi

titre "verdict"
if [ "$ECHECS" = 0 ]; then vert "REPETITION VERTE"; else rouge "$ECHECS point(s) en echec"; fi
exit $(( ECHECS > 0 ? 1 : 0 ))
