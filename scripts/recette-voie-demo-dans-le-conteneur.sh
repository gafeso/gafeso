#!/usr/bin/env bash
# RECETTE : les scripts de DEPLOY.md trouvent-ils ce qu'ils lisent, DANS L'IMAGE ?
#
# 🔴 CE QU'ELLE EXISTE POUR ATTRAPER, et ça a coûté une commande échouée sur la
# DÉMONSTRATION (12 octobre 2026, mesuré par Jean) :
#
#     ENOENT '/app/apps/api/src/cataloging/corpus-demonstration'
#     (engendrer-document-demo.mjs:60)
#
# L'image copie `dist`, `prisma`, `package.json` et `scripts` — **jamais
# `src/`**. Le corpus de documents de démonstration vivait sous `src/`.
#
# ⚠ ET POURQUOI MA RECETTE DE LA VOIE DÉMO NE L'AVAIT PAS VU : elle avait tourné
# HORS CONTENEUR, dans l'arbre du dépôt, où `src/` existe.
#
#   > ⭐ Une recette qui FOURNIT l'environnement qu'elle éprouve ne mesure que
#   > sa propre fixture.
#
# C'est la DEUXIÈME fois que cette famille coûte une panne de production, après
# le refus de démarrage de rc4 — et la première fois, la leçon avait déjà été
# écrite. Une règle écrite protège de l'ignorance, pas de la pente : d'où cette
# recette, qui mesure DANS le conteneur construit par le compose de production.
#
# ⚠ Elle ne touche aucune instance en service : projet docker dédié, secrets
# ENGENDRÉS, `caddy` et `web` jamais démarrés, nettoyage par DIFFÉRENCE
# d'ensembles contre un recensement de départ.
#
# Usage : ./scripts/recette-voie-demo-dans-le-conteneur.sh
set -uo pipefail
cd "$(dirname "$0")/.." || { echo "racine du depot introuvable : rien n a ete mesure" >&2; exit 1; }

PROJET=gafeso-recette-voie-demo
COMPOSE=docker/docker-compose.prod.yml
BAC="$(mktemp -d)"
ENVF="$BAC/.env.prod"
ECHECS=0

vert()  { printf '  ✓ %s\n' "$1"; }
rouge() { printf '  🔴 %s\n' "$1"; ECHECS=$((ECHECS+1)); }
titre() { printf '\n═══ %s ═══\n' "$1"; }

dc() { docker compose --env-file "$ENVF" -f "$COMPOSE" -p "$PROJET" "$@"; }

VOL_AVANT="$(docker volume ls -q | LC_ALL=C sort)"
nettoyer() {
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  comm -13 <(printf '%s\n' "$VOL_AVANT") <(docker volume ls -q | LC_ALL=C sort) \
    | grep "^$PROJET" | xargs -r docker volume rm -f >/dev/null 2>&1 || true
  rm -rf "$BAC"
}
trap nettoyer EXIT

titre "préparation — un .env.prod jetable, secrets ENGENDRÉS"
cat > "$ENVF" <<ENV
COMPOSE_PROJECT_NAME=$PROJET
APP_URL=https://recette.invalid
API_DOMAIN=https://api.recette.invalid
PUBLIC_DOMAIN=recette.invalid
STORAGE_DOMAIN=storage.recette.invalid
ACME_EMAIL=recette@recette.invalid
MINIO_PUBLIC_URL=https://storage.recette.invalid
HTTP_PORT=18081
HTTPS_PORT=18444
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

titre "① la VERSION est posée AVANT la construction — comme DEPLOY.md le prescrit"
# ⚠ ET CE N'EST PAS UNE FORMALITÉ : sans elle, la construction REFUSE. Mesuré à
# la première exécution de cette recette — le garde posé en rc8 a mordu, et ma
# recette ne suivait pas la procédure « à la lettre ». La séquence est en tête de
# DEPLOY.md, et c'est elle qu'on exécute ici.
if V="$(scripts/version-du-depot.sh --exporter)"; then
  eval "$V"
  vert "version posée : ${GAFESO_VERSION:-?} / ${GAFESO_COMMIT:-?}"
else
  rouge "version-du-depot.sh a refusé — la construction refusera aussi"
  exit 1
fi
export GAFESO_VERSION GAFESO_COMMIT

titre "② l'image est construite par le compose de PRODUCTION"
if ! dc up -d --build api >"$BAC/up.log" 2>&1; then
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
[ "$etat" = healthy ] && vert "conteneur api SAIN" || rouge "api jamais sain (« $etat »)"

# ── ⭐ LA MESURE QUI AURAIT ATTRAPÉ LE DÉFAUT
#
# Les chemins ne sont pas écrits ici : ils sont DÉRIVÉS de DEPLOY.md et des
# scripts eux-mêmes, par le même relevé que le garde déterministe. Une liste
# recopiée serait en retard d'un script.
titre "③ chaque fichier lu par un script de DEPLOY.md existe-t-il DANS l'image ?"
CHEMINS="$(node --input-type=module -e "
import { readFileSync } from 'node:fs'; import { posix } from 'node:path';
const DEPLOY = readFileSync('DEPLOY.md', 'utf-8');
const scripts = [...new Set([...DEPLOY.matchAll(/node (scripts\/[A-Za-z0-9_.\/-]+\.mjs)/g)].map((m) => m[1]))];
function lus(s, vus = new Set()) {
  if (vus.has(s)) return []; vus.add(s);
  const src = readFileSync(s, 'utf-8'); const t = new Set([s]);
  for (const m of src.matchAll(/'((?:apps|scripts|docs|docker)\/[A-Za-z0-9_.\/-]+)'/g)) t.add(m[1]);
  const d = s.slice(0, s.lastIndexOf('/'));
  for (const m of src.matchAll(/from '(\.\.?\/[A-Za-z0-9_.\/-]+\.mjs)'/g)) {
    const i = posix.normalize(d + '/' + m[1]); t.add(i);
    for (const c of lus(i, vus)) t.add(c);
  }
  return [...t];
}
const tout = new Set(); for (const s of scripts) for (const c of lus(s)) tout.add(c);
console.log([...tout].sort().join('\n'));
")"
N="$(printf '%s\n' "$CHEMINS" | grep -c . || true)"
# ⚠ TÉMOIN DE COMPTE : un relevé vide rendrait cette recette VERTE sur rien.
if [ "${N:-0}" -lt 8 ]; then
  rouge "le relevé n'a trouvé que $N chemin(s) — il ne regarde pas ce qu'il croit"
else
  vert "$N chemins relevés depuis DEPLOY.md et les imports des scripts"
  manquants=0
  while IFS= read -r c; do
    [ -z "$c" ] && continue
    if dc exec -T api test -e "/app/$c" 2>/dev/null; then
      printf '  ✓ %s\n' "$c"
    else
      rouge "ABSENT DE L'IMAGE : /app/$c"
      manquants=$((manquants+1))
    fi
  done <<< "$CHEMINS"
  [ "$manquants" = 0 ] && vert "⭐ tout ce que lisent les scripts de DEPLOY.md est dans l'image"
fi

# ── ⭐ ET LA LIGNE EXACTE QUI A PLANTÉ, exécutée DANS le conteneur
titre "④ le corpus est-il LISIBLE depuis l'image ? (la ligne qui a planté)"
sortie="$(dc exec -T api node --input-type=module -e "
const m = await import('/app/scripts/dev/engendrer-document-demo.mjs');
const c = m.corpus();
console.log('OEUVRES|' + c.length);
console.log('TITRES|' + c.map((o) => o.titre ?? o.oeuvre ?? '?').join(', '));
" 2>&1 || true)"
if printf '%s' "$sortie" | grep -q ENOENT; then
  rouge "ENOENT dans le conteneur — c'est EXACTEMENT le défaut du 12/10/2026"
  printf '%s\n' "$sortie" | head -4 | sed 's/^/      /'
else
  n="$(printf '%s\n' "$sortie" | sed -n 's/^OEUVRES|//p')"
  if [ "${n:-0}" -ge 4 ]; then
    vert "⭐ $n œuvres lues DANS le conteneur — le corpus est dans l'image"
    printf '%s\n' "$sortie" | sed -n 's/^TITRES|/      /p'
  else
    rouge "le corpus rend ${n:-0} œuvre(s) dans le conteneur — attendu au moins 4"
    printf '%s\n' "$sortie" | head -4 | sed 's/^/      /'
  fi
fi

# ── ⭐ CONTRÔLE NÉGATIF — le garde de localité s'applique toujours DANS le conteneur
titre "⑤ contrôle négatif : sans l'option, le garde de LOCALITÉ refuse"
sortie="$(dc exec -T -e GAFESO_BIB_EMAIL=x@y.z -e GAFESO_BIB_PASSWORD=z api \
  node /app/scripts/dev/remplacer-documents-demo.mjs demo 2>&1 || true)"
if printf '%s' "$sortie" | grep -qiE "localhost|locale|REFUS"; then
  vert "⭐ refusé par le garde de localité — il n'est PAS relâché dans l'image"
  printf '%s\n' "$sortie" | grep -iE "REFUS|localhost" | head -2 | sed 's/^/      /'
else
  rouge "le garde de localité n'a pas refusé dans le conteneur"
  printf '%s\n' "$sortie" | head -6 | sed 's/^/      /'
fi

# ── ⭐ LA COMMANDE DE DEPLOY.md, JUSQU'AU BOUT, SANS `docker cp`
#
# ⚠ Les quatre étapes précédentes prouvent que le corpus est LISIBLE dans
# l'image. Elles ne prouvent pas que la COMMANDE aille au bout — et c'est elle
# que l'exploitant tape. On provisionne donc une école JETABLE par les ROUTES DU
# PRODUIT, on la marque par le bloc SQL de DEPLOY.md, et on lance le script avec
# ses trois conditions et `--confirmation` (une recette ne peut pas taper).
titre "⑥ la commande de DEPLOY.md, jusqu'au bout, dans le conteneur"
SLUG=recette-demo
if dc exec -T \
     -e SEED_API_URL=http://localhost:4000 \
     -e PROVISION_SLUG="$SLUG" \
     -e PROVISION_SCHOOL_NAME="École de recette" \
     api node /app/scripts/provision-production.mjs >"$BAC/prov.log" 2>&1; then
  vert "école jetable provisionnée PAR LES ROUTES DU PRODUIT"
else
  rouge "le provisionnement a échoué"
  tail -8 "$BAC/prov.log" | sed 's/^/      /'
fi

# Le marquage, par le bloc SQL de DEPLOY.md — celui qui LÈVE plutôt que
# d'imprimer un compte à lire.
marque="$(dc exec -T db psql -U bibliocloud -d bibliocloud -v ON_ERROR_STOP=1 -q 2>&1 <<SQL
DO \$\$
DECLARE touchees int;
BEGIN
  UPDATE public.tenant_settings s SET est_instance_de_demonstration = true
    FROM public.tenants t WHERE t.id = s.tenant_id AND t.slug = '$SLUG';
  GET DIAGNOSTICS touchees = ROW_COUNT;
  IF touchees <> 1 THEN
    RAISE EXCEPTION 'MARQUAGE REFUSÉ : % ligne(s) au lieu d''une.', touchees;
  END IF;
END \$\$;
SQL
)"
if printf '%s' "$marque" | grep -qi "EXCEPTION\|ERROR"; then
  rouge "le marquage a échoué"
  printf '%s\n' "$marque" | head -4 | sed 's/^/      /'
else
  vert "école marquée comme instance de démonstration (bloc SQL de DEPLOY.md)"
fi

# ⚠ LE DOMAINE vient de l'école, pas d'une valeur écrite ici : le script exige
# qu'il corresponde EXACTEMENT au domaine principal.
DOM="$(dc exec -T db psql -U bibliocloud -d bibliocloud -At -c \
  "SELECT d.domain FROM public.domains d JOIN public.tenants t ON t.id=d.tenant_id
    WHERE t.slug='$SLUG' AND d.is_primary ORDER BY 1 LIMIT 1;" 2>/dev/null | tr -d '\r')"
[ -n "$DOM" ] && vert "domaine principal lu en base : $DOM" || rouge "aucun domaine principal"

sortie="$(dc exec -T \
  -e GAFESO_BIB_EMAIL="admin@$DOM" \
  -e GAFESO_BIB_PASSWORD=jamais-utilise \
  api node /app/scripts/dev/remplacer-documents-demo.mjs "$SLUG" \
    "--instance-de-demonstration=$DOM" "--confirmation=$SLUG" 2>&1)"
# ⚠ LE CODE DE SORTIE, LU AVANT TOUT TUYAU. Un `|| true` l'aurait avalé — et
# « la voie s'est ouverte » n'est pas « le script est allé au bout ».
CODE_SCRIPT=$?
if printf '%s' "$sortie" | grep -q ENOENT; then
  rouge "ENOENT — le corpus manque encore quelque part"
  printf '%s\n' "$sortie" | grep -i enoent | head -2 | sed 's/^/      /'
elif printf '%s' "$sortie" | grep -q "VOIE DE DÉMONSTRATION"; then
  vert "⭐ les TROIS conditions acceptées DANS le conteneur, sans docker cp"
  # ⚠ LA BORNE DE CETTE RECETTE, ÉCRITE PLUTÔT QUE DÉCOUVERTE.
  #
  # Le script s'arrête à l'AUTHENTIFICATION, et c'est le plus loin qu'une
  # recette puisse aller : le mot de passe du bibliothécaire n'existe pas dans
  # une pile jetable, et **en fabriquer un est interdit** (`CLAUDE.md` : jamais
  # de session fabriquée, le compte se crée par le chemin normal — inscription,
  # activation, lien de définition de mot de passe, qui passe par un courriel).
  #
  # ⭐ Ce qui est donc mesuré est tout ce qui précède le téléversement : les
  # trois conditions, le corpus, le récapitulatif. Et un refus EXPLICITE à
  # l'authentification est le bon comportement — ce qu'on refuse ici est un
  # PLANTAGE, pas un refus.
  if [ "$CODE_SCRIPT" = 0 ]; then
    vert "⭐ et le script est allé AU BOUT — code de sortie 0"
  elif printf '%s' "$sortie" | grep -q "connexion refusée"; then
    vert "⭐ arrêté à l'AUTHENTIFICATION, avec un refus explicite — borne de la recette"
    printf '%s\n' "$sortie" | grep -E "REFUS" | head -1 | sed 's/^/      /'
    detail_auth=1
  else
    rouge "le script a fini en $CODE_SCRIPT, et ce n'est pas un refus d'authentification"
    printf '%s\n' "$sortie" | tail -6 | sed 's/^/      /'
  fi
  if [ "${detail_auth:-0}" = 1 ]; then
    printf '      %s\n' "⚠ NON MESURÉ ICI : le téléversement lui-même. Il exige un mot de passe"
    printf '      %s\n' "  de bibliothécaire, et en fabriquer un est interdit. Pour l'éprouver :"
    printf '      %s\n' "  fournir GAFESO_BIB_EMAIL / GAFESO_BIB_PASSWORD d'un compte réel."
  fi
  printf '%s\n' "$sortie" | grep -E "VOIE DE DÉMONSTRATION|ligne de commande|à remplacer|ÉPARGNÉS|aucune copie|0 remplacé" \
    | head -5 | sed 's/^/      /'
else
  rouge "la voie de démonstration n'a pas été ouverte"
  printf '%s\n' "$sortie" | head -8 | sed 's/^/      /'
fi

# ── ⭐ ⑦ LA BORNE EST FERMÉE : un compte jetable, et un document PRÊT HORS LIGNE
#
# ⚠ AUTORISÉ PAR JEAN LE 12 OCTOBRE 2026, et les quatre conditions tiennent :
# le compte se crée par le CHEMIN NORMAL (la route publique de mot de passe), le
# mot de passe est ALÉATOIRE et lu dans l'environnement, il ne quitte jamais le
# processus (aucun journal, aucun fichier, aucune sortie), et il meurt avec la
# pile.
#
# ⚠ `-e RECETTE_PASSWORD` SANS `=` : docker prend la valeur dans MON
# environnement, elle n'entre donc pas dans l'argv — là où `-e VAR=$X` la
# rendrait visible à un `ps` de cette machine.
titre "⑦ le téléversement, jusqu'au document PRÊT HORS LIGNE"
# ⚠ PAS PAR `comptes-de-recette.mjs` : il porte SON PROPRE garde de localité, et
# il a refusé — « il RÉINITIALISE des mots de passe ; pointé sur une instance en
# service, il ouvrirait deux comptes au mot de passe d'un fichier de
# développement ». Son refus est juste, et je ne le relâche pas.
#
# ⭐ L'ACTEUR est donc le compte que le PROVISIONNEMENT a créé (étape ⑥), par
# les routes du produit. Son mot de passe est posé par la route PUBLIQUE
# `POST /accounts/set-password`, exactement comme pour un vrai compte — c'est le
# chemin normal, et c'est ce qui rend ce compte légitime.
#
# ⚠ `-e RECETTE_PASSWORD` SANS `=` : docker prend la valeur dans MON
# environnement, elle n'entre donc pas dans l'argv — là où `-e VAR=$X` la
# rendrait visible à un `ps` de cette machine.
RECETTE_PASSWORD="$(openssl rand -base64 24)"
export RECETTE_PASSWORD
# ⚠ TÉMOIN SUR LA LONGUEUR, jamais sur la valeur.
[ "${#RECETTE_PASSWORD}" -ge 24 ] \
  && vert "mot de passe engendré (${#RECETTE_PASSWORD} caractères, jamais affiché)" \
  || rouge "le mot de passe engendré est trop court"

sortie="$(dc exec -T \
  -e RECETTE_SLUG="$SLUG" \
  -e RECETTE_EMAIL="admin@$DOM" \
  -e RECETTE_PASSWORD \
  api node /app/scripts/dev/recette-televersement.mjs 2>&1)"
CODE_TELEV=$?
printf '%s\n' "$sortie" | grep -E '\[(ok|KO)\]' | sed 's/^/      /'
if [ "$CODE_TELEV" = 0 ] && printf '%s' "$sortie" | grep -q "PRET HORS LIGNE"; then
  vert "⭐ LA BORNE EST FERMÉE — un document du corpus est PRÊT HORS LIGNE"
else
  rouge "le téléversement n'est pas allé jusqu'au bout (code $CODE_TELEV)"
  printf '%s\n' "$sortie" | tail -8 | sed 's/^/      /'
fi
# ⚠ La variable vivrait jusqu'à la fin de CE processus, pas seulement de la pile.
unset RECETTE_PASSWORD

titre "verdict"
if [ "$ECHECS" = 0 ]; then
  printf '  ✓ RECETTE VERTE — mesurée DANS le conteneur de production\n\n'
else
  printf '  🔴 %s ÉCHEC(S)\n\n' "$ECHECS"
fi
exit "$ECHECS"
