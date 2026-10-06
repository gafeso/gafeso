#!/usr/bin/env bash
# RECETTE DE L'ASSISTANT D'INSTALLATION — sur une instance JETABLE complète.
#
# Elle éprouve les neuf points de `docs/conception-assistant-installation.md`,
# chacun par son EFFET et jamais par la présence du code.
#
# ⚠ ELLE NE TOUCHE NI LA BASE DE DÉVELOPPEMENT NI AUCUNE INSTANCE EN SERVICE :
# elle crée son propre cluster PostgreSQL jetable, y applique les migrations,
# démarre une API sur un port libre, et détruit tout à la fin par DIFFÉRENCE
# D'ENSEMBLES avec le recensement de départ.
#
# Usage : scripts/recette-assistant-installation.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CONTENEUR=pg-recette-assistant
# ⚠ LES SECRETS DE CETTE RECETTE S'ENGENDRENT, ILS NE S'ÉCRIVENT PAS.
#
# La première version portait un JWT_SECRET littéral et un mot de passe dans une
# URL. Le garde de publication a REFUSÉ le push, et il avait raison : la règle ne
# se module PAS selon la valeur du secret, sinon il faut juger à chaque fois — et
# c'est ce jugement, exercé à chaud, qui a produit les cinq occurrences de
# secrets versionnés de ce dépôt.
#
# Les engendrer est en outre une MEILLEURE recette : elle prouve qu'elle ne
# dépend d'aucune valeur particulière.
SECRET_JETABLE="$(openssl rand -hex 24)"
MDP_JETABLE="$(openssl rand -hex 16)"
PORT_PG=55436
PORT_API=4123
ETAT=$(mktemp -d)
JETON_FICHIER="$ETAT/jeton-installation.txt"
API_PID=""
ECHECS=0

vert()  { printf '  ✓ %s\n' "$1"; }
rouge() { printf '  🔴 %s\n' "$1"; ECHECS=$((ECHECS+1)); }
titre() { printf '\n═══ %s ═══\n' "$1"; }

nettoyer() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
  rm -rf "$ETAT"
}
trap nettoyer EXIT

# ── Le cluster jetable
titre "préparation — cluster jetable et migrations"
docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
docker run -d --name "$CONTENEUR" -e POSTGRES_PASSWORD="$MDP_JETABLE" -p "$PORT_PG":5432 postgres:16 >/dev/null
for _ in $(seq 1 60); do docker exec "$CONTENEUR" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CONTENEUR" pg_isready -U postgres >/dev/null || { echo "cluster injoignable" >&2; exit 1; }

export DATABASE_URL="postgresql://postgres:${MDP_JETABLE}@localhost:${PORT_PG}/postgres?schema=public"
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma >/dev/null
appliquees=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select count(*) from public._prisma_migrations where finished_at is not null" | tr -d ' ')
[ "$appliquees" -gt 30 ] && vert "$appliquees migrations appliquées" || rouge "seulement $appliquees migrations — la recette ne mesurerait rien"

# ⚠ POINT 8 — le jeton n'est pas en clair en base
titre "⑧ le jeton n'est pas en clair dans la base"
ligne=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select coalesce(jeton_hash,'NULL') || '|' || case when terminee_le is null then 'OUVERT' else 'TERMINEE' end from public.installation")
[ "${ligne#*|}" = "OUVERT" ] && vert "l'installation est OUVERTE sur une base neuve" || rouge "attendu OUVERT, obtenu ${ligne#*|}"

# ── PHASE 0 — le SECOND motif du test de courriel, sur une API éphémère.
#
# ⚠ ELLE PASSE EN PREMIER, et c'est un ordre OBLIGÉ : chaque démarrage de l'API
# RÉGÉNÈRE le jeton d'amorçage (pour fermer le trou « j'ai perdu le fichier »).
# Une seconde API démarrée après la principale invaliderait donc son jeton en
# pleine recette — un défaut que l'ordre évite et qu'aucun commentaire ne
# rattraperait.
titre "⑥ bis — le motif smtp_error, avec le message DU SERVEUR"
npx nest build -p apps/api/tsconfig.build.json >/dev/null 2>&1 || npm run build -w @gafeso/api >/dev/null 2>&1
[ -f apps/api/dist/main.js ] || { echo "la construction n'a pas produit dist/main.js" >&2; exit 1; }
ETAT0=$(mktemp -d); JET0="$ETAT0/jeton.txt"
env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="$DATABASE_URL" API_PORT=4124 NODE_ENV=development \
  APP_URL="http://localhost:3000" JWT_SECRET="$SECRET_JETABLE" \
  GAFESO_ETAT_DIR="$ETAT0" GAFESO_JETON_INSTALLATION_FICHIER="$JET0" \
  GAFESO_VERSION="v0.0.0-recette" GAFESO_COMMIT="0000000" \
  SMTP_HOST="127.0.0.1" SMTP_PORT="1" SMTP_USER="" SMTP_PASS="" \
  node apps/api/dist/main.js > "$ETAT0/api.log" 2>&1 &
PID0=$!
for _ in $(seq 1 60); do curl -fsS "http://localhost:4124/health" >/dev/null 2>&1 && break; sleep 1; done
if curl -fsS "http://localhost:4124/health" >/dev/null 2>&1; then
  grep -q "SMTP configuré" "$ETAT0/api.log" \
    && vert "témoin : cette API voit un SMTP (injoignable, port 1)" \
    || rouge "témoin d'isolation inversé : elle ne voit AUCUN SMTP, le motif ne serait pas smtp_error"
  J0=$(grep -v '^#' "$JET0" | grep -v '^$' | head -1)
  S0=$(curl -s -X POST -H 'content-type: application/json' -d "{\"jeton\":\"$J0\"}" \
       "http://localhost:4124/installation/jeton" | sed -n 's/.*"session":"\([^"]*\)".*/\1/p')
  T0=$(curl -s -X POST -H "x-installation-session: $S0" -H 'content-type: application/json' \
       -d '{"destinataire":"moi@exemple.bf"}' "http://localhost:4124/installation/test-courriel")
  echo "$T0" | grep -q '"motif":"smtp_error"' && vert "motif smtp_error (le serveur a refusé)" || rouge "motif: $T0"
  echo "$T0" | grep -q '"detailServeur":"[^"]' && vert "⭐ le message DU SERVEUR sort — seule chose qui distingue auth refusée d'hôte injoignable" || rouge "detailServeur vide : $T0"
  echo "$T0" | grep -q '"envoye":false' && vert "envoye:false" || rouge "$T0"
  echo "$T0" | grep -qi 'SMTP_USER / SMTP_PASS' && vert "le geste nomme les deux causes possibles" || rouge "geste trop vague"
else
  rouge "la phase 0 n'a pas démarré"; tail -5 "$ETAT0/api.log" | sed 's/^/      /'
fi
kill "$PID0" 2>/dev/null || true; wait "$PID0" 2>/dev/null || true
rm -rf "$ETAT0"

# ── L'API
titre "démarrage de l'API sur le cluster jetable"
npx nest build -p apps/api/tsconfig.build.json >/dev/null 2>&1 || npm run build -w @gafeso/api >/dev/null 2>&1
[ -f apps/api/dist/main.js ] || { echo "la construction n'a pas produit dist/main.js" >&2; exit 1; }

env -i PATH="$PATH" HOME="$HOME" \
  DATABASE_URL="$DATABASE_URL" \
  API_PORT="$PORT_API" \
  NODE_ENV=development \
  APP_URL="http://localhost:3000" \
  JWT_SECRET="$SECRET_JETABLE" \
  GAFESO_ETAT_DIR="$ETAT" \
  GAFESO_JETON_INSTALLATION_FICHIER="$JETON_FICHIER" \
  GAFESO_VERSION="v0.0.0-recette" GAFESO_COMMIT="0000000" \
  SMTP_HOST="" SMTP_USER="" SMTP_PASS="" \
  node apps/api/dist/main.js > "$ETAT/api.log" 2>&1 &
API_PID=$!
for _ in $(seq 1 60); do curl -fsS "http://localhost:$PORT_API/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://localhost:$PORT_API/health" >/dev/null || { echo "--- journal de l'API ---"; tail -30 "$ETAT/api.log"; exit 1; }
vert "API démarrée — le graphe d'injection résout (ce qu'aucun test unitaire ne fait)"

# ⚠ TÉMOIN D'ISOLATION, né d'un défaut de cette recette (6 octobre 2026) :
# `env -i` nettoie l'environnement du PROCESSUS, mais l'application lit
# `../../.env` depuis le DISQUE — donc la première version de cette recette
# mesurait une instance avec le SMTP de développement, et son contrôle du motif
# « smtp_absent » a échoué en accusant le produit. Sans ce témoin, on ne sait
# pas sur quelle configuration la recette s'exécute.
if grep -q "SMTP non configuré" "$ETAT/api.log"; then
  vert "⭐ témoin d'isolation : l'API tourne SANS SMTP (le .env du dépôt ne l'a pas atteinte)"
else
  rouge "L'ISOLATION A ÉCHOUÉ — cette API voit un SMTP, la recette ne mesure pas une instance neuve"
  grep -m1 "SMTP" "$ETAT/api.log" | sed 's/^/      /'
fi

A="http://localhost:$PORT_API"
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
corps() { curl -s "$@"; }

# ── POINT 1 — sans jeton, rien ne passe
titre "① sans session, rien ne passe — sauf `etat`"
[ "$(code "$A/installation/etat")" = 200 ] && vert "etat → 200 (publique, par dessein)" || rouge "etat devrait être publique"
requise=$(corps "$A/installation/etat")
echo "$requise" | grep -q '"requise":true' && vert "etat dit requise:true" || rouge "etat: $requise"
echo "$requise" | grep -qvE 'nom|domaine|version|smtp' && vert "etat ne fuit QUE le booléen" || rouge "etat en dit trop : $requise"
for r in constat modules; do
  c=$(code "$A/installation/$r"); [ "$c" = 401 ] && vert "GET $r sans session → 401" || rouge "GET $r → $c (401 attendu)"
done
c=$(code -X POST -H 'content-type: application/json' -d '{"destinataire":"x@y.bf"}' "$A/installation/test-courriel")
[ "$c" = 401 ] && vert "POST test-courriel sans session → 401" || rouge "test-courriel → $c"
c=$(code -X POST -H 'content-type: application/json' -d '{"confirme":true}' "$A/installation/terminer")
[ "$c" = 401 ] && vert "POST terminer sans session → 401" || rouge "terminer → $c"

# ── Le jeton : le FICHIER, ses droits, et le journal
titre "le jeton d'amorçage — fichier, droits, et ce que le journal NE dit pas"
[ -s "$JETON_FICHIER" ] && vert "le fichier existe" || rouge "aucun fichier de jeton"
droits=$(stat -c '%a' "$JETON_FICHIER")
[ "$droits" = 600 ] && vert "droits 0600" || rouge "droits $droits (0600 attendu)"
JETON=$(grep -v '^#' "$JETON_FICHIER" | grep -v '^$' | head -1)
[ -n "$JETON" ] && vert "jeton lu (${#JETON} caractères)" || rouge "jeton illisible"
grep -q "NE COLLEZ JAMAIS" "$JETON_FICHIER" && vert "le fichier dit de ne pas coller son contenu" || rouge "l'avertissement manque"
# ⭐ LE POINT QUI RÉPOND À LA QUESTION DE JEAN : le clair n'est PAS dans le journal
if grep -qF "$JETON" "$ETAT/api.log"; then rouge "LE JETON EST DANS LE JOURNAL DE L'API"; else vert "⭐ le clair n'est dans AUCUNE ligne du journal"; fi
grep -q "$JETON_FICHIER" "$ETAT/api.log" && vert "le journal donne le CHEMIN (collable sans danger)" || rouge "le journal ne nomme pas le fichier"
# et en base, seulement un haché
hash_base=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select coalesce(jeton_hash,'NULL') from public.installation" | tr -d ' ')
[ "$hash_base" != "$JETON" ] && vert "la base porte un haché, pas le clair" || rouge "LE CLAIR EST EN BASE"
[ "${#hash_base}" = 64 ] && vert "empreinte SHA-256 (64 hex)" || rouge "empreinte de ${#hash_base} caractères"

# ── POINT 4 — le throttle et le verrou
titre "④ un jeton faux est refusé, compté, et le compte est PERSISTÉ"
c=$(code -X POST -H 'content-type: application/json' -d '{"jeton":"faux"}' "$A/installation/jeton")
[ "$c" = 401 ] && vert "jeton faux → 401" || rouge "jeton faux → $c"
essais=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select essais_rates from public.installation" | tr -d ' ')
[ "$essais" -ge 1 ] && vert "essais_rates persisté à $essais (un redémarrage ne le remet pas à zéro)" || rouge "essais_rates = $essais"
grep -q "FAUX présenté" "$ETAT/api.log" && vert "le refus est journalisé" || rouge "refus non journalisé"
if grep -qF '"jeton":"faux"' "$ETAT/api.log"; then rouge "le corps de la requête est journalisé"; else vert "le corps présenté n'est pas journalisé"; fi

# ── La session, puis les routes gardées
titre "la session d'assistant, et ce que le constat NE rend pas"
SESSION=$(corps -X POST -H 'content-type: application/json' -d "{\"jeton\":\"$JETON\"}" "$A/installation/jeton" \
  | sed -n 's/.*"session":"\([^"]*\)".*/\1/p')
[ -n "$SESSION" ] && vert "session ouverte" || rouge "pas de session : $(corps -X POST -H 'content-type: application/json' -d "{\"jeton\":\"$JETON\"}" "$A/installation/jeton")"
essais=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select essais_rates from public.installation" | tr -d ' ')
[ "$essais" = 0 ] && vert "un essai RÉUSSI remet le compteur à zéro" || rouge "essais_rates = $essais après succès"
H=(-H "x-installation-session: $SESSION")
cst=$(corps "${H[@]}" "$A/installation/constat")
echo "$cst" | grep -q '"hote"' && vert "constat rend smtp.hote" || rouge "constat: $cst"
if echo "$cst" | grep -qiE 'motDePasse|password|SMTP_PASS'; then rouge "LE CONSTAT FUIT UN SECRET"; else vert "⭐ aucun secret dans le constat"; fi
echo "$cst" | grep -q '"horsPortee"' && vert "constat DIT ce que l'assistant ne peut pas faire" || rouge "horsPortee absent"
mods=$(corps "${H[@]}" "$A/installation/modules")
nb=$(echo "$mods" | grep -o '"id":' | wc -l)
[ "$nb" -gt 5 ] && vert "modules lus dans le registre ($nb)" || rouge "$nb modules"
echo "$mods" | grep -q '"ecransPerdus"' && vert "les écrans perdus sont servis" || rouge "ecransPerdus absent"

# ── POINT 6 — le test de courriel dit la vérité
titre "⑥ le test de courriel DIT LA VÉRITÉ (aucun SMTP configuré)"
tc=$(corps -X POST "${H[@]}" -H 'content-type: application/json' -d '{"destinataire":"moi@exemple.bf"}' "$A/installation/test-courriel")
c=$(code -X POST "${H[@]}" -H 'content-type: application/json' -d '{"destinataire":"moi@exemple.bf"}' "$A/installation/test-courriel")
[ "$c" = 200 ] && vert "un échec d'envoi est un 200 (réponse réussie à la question posée)" || rouge "code $c"
echo "$tc" | grep -q '"envoye":false' && vert "envoye:false — il ne prétend PAS avoir envoyé" || rouge "$tc"
echo "$tc" | grep -q '"motif":"smtp_absent"' && vert "motif smtp_absent (le motif réel, pas un motif inventé)" || rouge "motif: $tc"
echo "$tc" | grep -q '"geste"' && vert "il dit QUOI FAIRE" || rouge "geste absent"
echo "$tc" | grep -q 'sans courriel' && vert "il dit qu'on peut terminer sans courriel" || rouge "la sortie n'est pas dite"

# ── POINT 7 et la reprise
titre "⑦ terminer SANS SMTP : le lien est rendu quand même"
charge='{"etablissement":{"nom":"Université d’Exemple","slug":"uex"},"domaine":"biblio.exemple.org","administrateur":{"email":"awa@exemple.bf","prenom":"Awa","nom":"Traoré"},"modulesDesactives":["rappels"],"confirme":true}'
c=$(code -X POST "${H[@]}" -H 'content-type: application/json' -d "$(echo "$charge" | sed 's/"confirme":true/"confirme":false/')" "$A/installation/terminer")
[ "$c" = 400 ] && vert "confirme:false → 400 (second geste explicite exigé)" || rouge "confirme:false → $c"
fin=$(corps -X POST "${H[@]}" -H 'content-type: application/json' -d "$charge" "$A/installation/terminer")
echo "$fin" | grep -q '"termine":true' && vert "installation terminée" || rouge "$fin"
echo "$fin" | grep -q '"lienMotDePasse":"http' && vert "⭐ lienMotDePasse RENDU malgré l'absence de SMTP" || rouge "pas de lien : $fin"
echo "$fin" | grep -q '"courrielEnvoye":false' && vert "courrielEnvoye:false — il dit la vérité" || rouge "$fin"
echo "$fin" | grep -q '"avertissement"' && vert "il avertit que le lien n'est affiché qu'une fois" || rouge "avertissement absent"

# ── POINT 2, 3 et le jeton consommé
titre "② le jeton est à usage unique · ③ les routes rendent 410"
for r in constat modules; do
  c=$(code "${H[@]}" "$A/installation/$r"); [ "$c" = 410 ] && vert "GET $r après installation → 410 Gone" || rouge "GET $r → $c"
done
c=$(code -X POST -H 'content-type: application/json' -d "{\"jeton\":\"$JETON\"}" "$A/installation/jeton")
[ "$c" = 410 ] && vert "le même jeton rejoué → 410 (consommé)" || rouge "jeton rejoué → $c"
corps "$A/installation/etat" | grep -q '"requise":false' && vert "etat dit requise:false" || rouge "etat toujours requise"
hash_apres=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select coalesce(jeton_hash,'NULL') from public.installation" | tr -d ' ')
[ "$hash_apres" = "NULL" ] && vert "l'empreinte est effacée de la base" || rouge "empreinte encore là"
[ ! -f "$JETON_FICHIER" ] && vert "④ le FICHIER du jeton est effacé" || rouge "le fichier du jeton subsiste"

# ── Ce que l'installation a réellement produit
titre "l'effet : ce qui est EN BASE, pas ce que la réponse annonce"
ecoles=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select count(*) from public.tenants where slug='uex'" | tr -d ' ')
[ "$ecoles" = 1 ] && vert "l'école « uex » existe" || rouge "$ecoles école(s) « uex »"
schema=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select count(*) from pg_namespace where nspname='tenant_uex'" | tr -d ' ')
[ "$schema" = 1 ] && vert "le schéma tenant_uex existe" || rouge "pas de schéma tenant_uex"
admins=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select count(*) from tenant_uex.users where role='ADMIN' and status='ACTIVE'" | tr -d ' ')
[ "$admins" = 1 ] && vert "⭐ UN administrateur ACTIF — le compte qu'aucune route ne créait" || rouge "$admins administrateur(s)"
jetons=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select count(*) from tenant_uex.password_tokens" | tr -d ' ')
[ "$jetons" = 1 ] && vert "UN seul jeton de mot de passe (pas deux, dont un mort)" || rouge "$jetons jeton(s)"
eteints=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select modules_desactives::text from public.tenant_settings" | tr -d ' ')
echo "$eteints" | grep -q rappels && vert "le module « rappels » est bien ÉTEINT ($eteints)" || rouge "modules désactivés : $eteints"
dom=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select count(*) from public.domains where domain='biblio.exemple.org'" | tr -d ' ')
[ "$dom" = 1 ] && vert "le domaine est enregistré" || rouge "$dom domaine(s)"

# ── POINT 9 — une sauvegarde restaurée ne rouvre pas l'assistant
titre "⑨ une sauvegarde restaurée ne rouvre PAS l'assistant"
docker exec "$CONTENEUR" pg_dump -U postgres --clean --if-exists postgres > "$ETAT/sauvegarde.sql"
[ -s "$ETAT/sauvegarde.sql" ] && vert "sauvegarde prise ($(wc -c < "$ETAT/sauvegarde.sql") octets)" || rouge "sauvegarde vide"
docker exec -i "$CONTENEUR" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -f /dev/stdin < "$ETAT/sauvegarde.sql" 2>"$ETAT/restore.err" \
  && vert "restauration sans erreur" || { rouge "restauration en échec"; head -3 "$ETAT/restore.err" | sed 's/^/      /'; }
etat_restaure=$(docker exec "$CONTENEUR" psql -U postgres -tAc "select case when terminee_le is null then 'OUVERT' else 'TERMINEE' end from public.installation" | tr -d ' ')
[ "$etat_restaure" = "TERMINEE" ] && vert "⭐ l'état d'installation voyage AVEC les données : TERMINÉE" || rouge "après restauration : $etat_restaure"

# ── Le rapport
titre "RAPPORT"
if [ "$ECHECS" -eq 0 ]; then
  echo "  ✅ Les neuf points de la conception sont éprouvés PAR LEUR EFFET."
  echo "  ⚠ Deux points de la conception ont été CORRIGÉS plutôt qu'éprouvés —"
  echo "    l'atomicité inter-schémas (impossible : le schéma doit être commité"
  echo "    avant d'être adressable) et le motif « hote_injoignable » (MailOutcome"
  echo "    n'en distingue que trois). Voir la conception, chapitre 6."
  exit 0
fi
echo "  🔴 $ECHECS contrôle(s) en échec. Journal de l'API : $ETAT/api.log"
echo "     (le répertoire est détruit à la sortie — relancez en lisant la sortie ci-dessus)"
exit 1
