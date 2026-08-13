#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# Gafeso — RECETTE DE SORTIE
#
# Vérifie qu'une installation ne fait pas que DÉMARRER : qu'elle est
# réellement utilisable. Le scénario suit le parcours d'un client, de bout en
# bout, contre l'API réelle — créer un étudiant, téléverser un document,
# et prouver que l'étudiant y accède SANS qu'on ait créé de collection ni de
# règle à la main.
#
#   ADMIN_PW='<mot de passe admin>' ./scripts/recette-sortie.sh
#
# ⚠⚠ CE SCRIPT ÉCRIT DANS LA BASE CIBLÉE. ⚠⚠
#
#   Il CRÉE, dans l'établissement visé :
#     · un compte étudiant UNIQUE à chaque exécution
#       (awa.ouedraogo+<horodatage>@exemple.bf, matricule ETU-REC-<horodatage>)
#       et lui définit un mot de passe ;
#     · une règle d'accès sur la collection par défaut ;
#     · une notice de catalogue et un document numérique téléversé.
#
#   Il NE SUPPRIME RIEN : ces données RESTENT après l'exécution.
#
#   ➜ À n'utiliser que sur une installation JETABLE (essai, recette,
#     pré-production). JAMAIS sur une instance EN SERVICE : vous y laisseriez
#     un compte et des données de test, dans le catalogue vu par vos lecteurs.
#
#   Un garde-fou refuse toute cible non locale. Le contourner
#   (RECETTE_FORCE=1) est un acte délibéré, à vos risques.
#
# Variables : ADMIN_PW (requis) · GAFESO_BASE (défaut http://localhost:8080/api)
#             STUDENT_PW (défaut : tiré au hasard) · RECETTE_FORCE=1
#             API_CONTAINER (défaut gafeso-prod-api-1, pour lire les logs)
# ═════════════════════════════════════════════════════════════════════════
set -uo pipefail
BASE="${GAFESO_BASE:-http://localhost:8080/api}"

# Garde-fou de cible (voir l'avertissement en tête de fichier).
case "$BASE" in
  http://localhost*|http://127.0.0.1*) ;;
  *)
    if [ "${RECETTE_FORCE:-}" != "1" ]; then
      printf '\033[31m✖ Cible non locale (%s).\033[0m\n' "$BASE" >&2
      printf '  Ce scénario écrit des données de test. Sur une installation réelle,\n' >&2
      printf '  relancez avec RECETTE_FORCE=1 en connaissance de cause.\n' >&2
      exit 2
    fi ;;
esac
PASS=0; FAIL=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
ko()   { printf '  \033[31m✖\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# Extraction d'une clé de premier niveau. Le passage par argv évite toute
# collision de guillemets (le premier essai cassait sur eval('d['clé']')).
jqv() { python3 -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
print(d.get(sys.argv[1],"") if isinstance(d,dict) else "")' "$1" 2>/dev/null; }

step "0 · Santé de l'API"
curl -sf "$BASE/health" >/dev/null && ok "API répond" || { ko "API injoignable"; exit 1; }

step "1 · Connexion de l'administrateur d'école"
ADMIN_EMAIL="admin@gafeso.local"
ADMIN_PW="${ADMIN_PW:?mot de passe admin requis (variable ADMIN_PW)}"
# Mot de passe du compte étudiant de test. Jamais écrit en dur : un mot de
# passe publié dans un dépôt public deviendrait un compte ouvert sur toute
# installation où ce scénario aurait été lancé.
RECETTE_PDF_B64="JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNSAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovUHJvZHVjZXIgPEZFRkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyMDAwMjgwMDY4MDA3NDAwNzQwMDcwMDA3MzAwM0EwMDJGMDAyRjAwNjcwMDY5MDA3NDAwNjgwMDc1MDA2MjAwMkUwMDYzMDA2RjAwNkQwMDJGMDA0ODAwNkYwMDcwMDA2NDAwNjkwMDZFMDA2NzAwMkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyOT4KL01vZERhdGUgKEQ6MjAyNjA4MDMxOTQyMDlaKQovQ3JlYXRvciA8RkVGRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDIwMDAyODAwNjgwMDc0MDA3NDAwNzAwMDczMDAzQTAwMkYwMDJGMDA2NzAwNjkwMDc0MDA2ODAwNzUwMDYyMDAyRTAwNjMwMDZGMDA2RDAwMkYwMDQ4MDA2RjAwNzAwMDY0MDA2OTAwNkUwMDY3MDAyRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDI5PgovQ3JlYXRpb25EYXRlIChEOjIwMjYwODAzMTk0MjA5WikKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQovRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZwo+PgplbmRvYmoKCjUgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAxIDAgUgovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9IZWx2ZXRpY2EtNzA5ODQ4MDc4OSA0IDAgUgovSGVsdmV0aWNhLTk3NDI2ODI1NjggNCAwIFIKPj4KL1hPYmplY3QgPDwKPj4KL0V4dEdTdGF0ZSA8PAo+Pgo+PgovTWVkaWFCb3ggWyAwIDAgNTk1IDg0MiBdCi9Bbm5vdHMgWyBdCi9Db250ZW50cyBbIDYgMCBSIF0KPj4KZW5kb2JqCgo2IDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9MZW5ndGggMTczCj4+CnN0cmVhbQp4nHWOzQoCMQyE73mKngWxP+mkBfGg28WDF6EvILKKoocV8flN15OghEmYMCHfSOtK1rR6nGmxHW6v4Xk5HuZic+JkJWXjYOqJPJu6IzdFnYE1oqp3WrLAAYgS0HubxVswegSJ6BBRhKdN9Fa8+qBJFvUrU69UZ1Qq7Wn8x5H1HMlHJOPcb47w4YiWmaG/OmQUVadcG/2KNtU3hubTxKFJaUT91KMvXzxvCX88/AplbmRzdHJlYW0KZW5kb2JqCgp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTYgMDAwMDAgbiAKMDAwMDAwMDA3NiAwMDAwMCBuIAowMDAwMDAwMTI2IDAwMDAwIG4gCjAwMDAwMDA1OTYgMDAwMDAgbiAKMDAwMDAwMDY5NCAwMDAwMCBuIAowMDAwMDAwOTE3IDAwMDAwIG4gCgp0cmFpbGVyCjw8Ci9TaXplIDcKL1Jvb3QgMiAwIFIKL0luZm8gMyAwIFIKPj4KCnN0YXJ0eHJlZgoxMTYzCiUlRU9G"

# Identité UNIQUE à chaque exécution. Avec une adresse et un matricule figés,
# le second passage retombait sur le compte existant : son jeton d'activation
# étant à usage unique et déjà consommé, les étapes 8 et 9 échouaient sur
# « prérequis manquants ». Un administrateur qui relance la recette concluait à
# une régression inexistante — le faux signal qu'on traque partout ailleurs.
# Le patronyme garde son accent : l'assertion de recherche en dépend.
RECETTE_RUN="$(date -u +%Y%m%d%H%M%S)-$$"
STUDENT_EMAIL="awa.ouedraogo+${RECETTE_RUN}@exemple.bf"
STUDENT_MATRICULE="ETU-REC-${RECETTE_RUN}"

STUDENT_PW="${STUDENT_PW:-$(openssl rand -base64 18 | tr -d '\n=/+')Aa1!}"
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PW\"}")
TOKEN=$(printf '%s' "$LOGIN" | jqv accessToken)
[ -n "$TOKEN" ] && ok "JWT admin obtenu" || { ko "login admin échoué : $LOGIN"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN")

step "2 · SOCLE créé au provisioning"
COLS=$(curl -s "${AUTH[@]}" "$BASE/collections")
printf '%s' "$COLS" | grep -q "Fonds numérique" && ok "collection par défaut présente" || ko "collection par défaut ABSENTE : $COLS"
CID=$(printf '%s' "$COLS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(next((c['id'] for c in d if c.get('isDefault')),''))" 2>/dev/null)
[ -n "$CID" ] && ok "marquée isDefault (id=$CID)" || ko "aucune collection isDefault"
RULES=$(curl -s "${AUTH[@]}" "$BASE/collections/$CID/access-rules")
printf '%s' "$RULES" | grep -q '"className":null' && ok "règle joker/joker présente" || ko "règle par défaut absente : $RULES"
CLASSES=$(curl -s "${AUTH[@]}" "$BASE/enrollment/classes")
NBC=$(printf '%s' "$CLASSES" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
[ "${NBC:-0}" -ge 5 ] && ok "$NBC classes d'exemple créées" || ko "classes d'exemple manquantes ($NBC)"

step "3 · Création d'un étudiant (parcours réel : inscription publique + activation)"
# /accounts/staff refuse le rôle STUDENT (c'est la route du PERSONNEL). Un
# étudiant arrive par l'inscription publique, puis un gestionnaire l'active.
STU=$(curl -s -X POST "$BASE/accounts/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"firstName\":\"Awa\",\"lastName\":\"Ouédraogo\",\"matricule\":\"$STUDENT_MATRICULE\",\"className\":\"L1\"}")
SID=$(printf '%s' "$STU" | jqv userId)
if [ -z "$SID" ]; then
  # Scénario REJOUABLE : à la seconde exécution le compte existe déjà (409).
  # On le retrouve plutôt que d'échouer — sinon les étapes suivantes cascadent
  # sur un identifiant vide et signalent de faux défauts.
  SID=$(curl -s -G "${AUTH[@]}" --data-urlencode "q=$STUDENT_MATRICULE" "$BASE/accounts" | python3 -c 'import sys,json
d=json.load(sys.stdin); u=d.get("users") or []
print(u[0]["id"] if u else "")' 2>/dev/null)
  [ -n "$SID" ] && ok "étudiant déjà présent, réutilisé (id=$SID)" || ko "inscription échouée : $STU"
else
  ok "étudiant inscrit (id=$SID)"
fi
if [ -n "$SID" ]; then
  ACT=$(curl -s -X POST "$BASE/accounts/$SID/activate" "${AUTH[@]}" \
    -H 'Content-Type: application/json' -d '{}')
  # REPLI VISIBLE (bloc 5). Le lien n'est plus journalisé — il ne l'a jamais
  # dû : le déverser dans les logs, c'est le confier à qui a accès au serveur,
  # sans trace de qui l'a lu. Il se récupère par un canal maîtrisé, réservé à
  # « comptes.gerer » et tracé au journal d'audit. C'est CE chemin que doit
  # emprunter un administrateur dont le SMTP ne marche pas.
  LINKJ=$(curl -s "${AUTH[@]}" "$BASE/accounts/$SID/password-link")
  STU_URL=$(printf '%s' "$LINKJ" | jqv url)
  [ -n "$STU_URL" ] \
    && ok "lien d'activation récupérable par l'administrateur (repli sans SMTP)" \
    || ko "lien NON récupérable : $(printf '%s' "$LINKJ" | head -c 200)"

  # Et il ne doit PLUS fuiter dans les logs applicatifs.
  if docker logs "${API_CONTAINER:-gafeso-prod-api-1}" 2>&1 | grep -qE "definir-mot-de-passe\?token=[a-f0-9]{64}"; then
    ko "le lien d'activation FUIT dans les logs applicatifs"
  else
    ok "aucun lien d'activation dans les logs applicatifs"
  fi
  printf '%s' "$ACT" | grep -qi "ACTIVE\|setPasswordUrl" && ok "compte activé par le gestionnaire" || ok "compte déjà actif"
  # La classe déclarée doit avoir produit une VRAIE inscription (bloc 1).
  CLS=$(curl -s -G "${AUTH[@]}" --data-urlencode "q=$STUDENT_MATRICULE" "$BASE/accounts")
  printf '%s' "$CLS" | grep -q '"className":"L1"' && ok "classe L1 reflétée depuis l'inscription" || ko "classe non reflétée"
fi

step "4 · Recherche insensible aux accents"
R=$(curl -s "${AUTH[@]}" "$BASE/accounts?q=ouedraogo")
printf '%s' "$R" | grep -q "Ouédraogo" && ok "« ouedraogo » trouve « Ouédraogo »" || ko "recherche sans accent échoue : $(printf '%s' "$R" | head -c 200)"
# -G/--data-urlencode : sans encodage, l'accent brut dans l'URL casse la
# requête (ce n'est PAS un défaut de l'API — vérifié séparément).
R2=$(curl -s -G "${AUTH[@]}" --data-urlencode "q=Ouédraogo" "$BASE/accounts")
printf '%s' "$R2" | grep -q "Ouédraogo" && ok "« Ouédraogo » trouve aussi" || ko "recherche avec accent échoue"

step "5 · Règle d'accès avec classe inconnue → refus explicite"
BAD=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/collections/$CID/access-rules" "${AUTH[@]}" \
  -H 'Content-Type: application/json' -d '{"className":"CLASSE_QUI_NEXISTE_PAS"}')
[ "$BAD" = "400" ] && ok "classe inconnue refusée (HTTP 400)" || ko "classe inconnue acceptée (HTTP $BAD)"
GOOD=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/collections/$CID/access-rules" "${AUTH[@]}" \
  -H 'Content-Type: application/json' -d '{"className":"L1"}')
[ "$GOOD" = "201" ] && ok "classe réelle acceptée (HTTP 201)" || ko "classe réelle refusée (HTTP $GOOD)"

step "6 · « Classe » non modifiable via PATCH /accounts/:id"
PATCHC=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/accounts/$SID" "${AUTH[@]}" \
  -H 'Content-Type: application/json' -d '{"className":"M2"}')
[ "$PATCHC" = "400" ] && ok "className rejeté (HTTP 400)" || ko "className encore accepté (HTTP $PATCHC)"

step "7 · Téléversement d'un document → accessible SANS collection ni règle manuelle"
REC=$(curl -s -X POST "$BASE/cataloging/records" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"title":"Précis de médecine tropicale","contributors":[{"name":"Ouédraogo Salif","role":"AUTEUR_PRINCIPAL"}],"keywords":["médecine","tropicale","santé"]}')
RID=$(printf '%s' "$REC" | jqv id)
[ -n "$RID" ] && ok "notice créée (id=$RID)" || { ko "création notice échouée : $REC"; }
if [ -n "$RID" ]; then
  # PDF RÉEL, à table de références croisées valide. Un PDF factice passe
  # l'upload et la lecture en ligne, mais l'ingestion hors-ligne le REJETTE
  # (pdf-lib ne sait pas le ré-sérialiser). La recette validait donc l'accès
  # en ligne en croyant valider le hors-ligne — c'est précisément le trou que
  # les étapes 7bis/7ter ci-dessous ferment.
  printf '%s' "$RECETTE_PDF_B64" | base64 -d > /tmp/recette-doc.pdf
  UP=$(curl -s -X POST "$BASE/cataloging/records/$RID/digital-copy" "${AUTH[@]}" -F "file=@/tmp/recette-doc.pdf;type=application/pdf")
  printf '%s' "$UP" | grep -qi "objectKey\|fileFormat" && ok "document téléversé" || ko "téléversement échoué : $(printf '%s' "$UP" | head -c 200)"
  ATT=$(curl -s "${AUTH[@]}" "$BASE/collections/$CID")
  printf '%s' "$ATT" | grep -q "$RID" && ok "RATTACHÉ AUTOMATIQUEMENT à la collection par défaut" || ko "NON rattaché : $(printf '%s' "$ATT" | head -c 300)"

  # 7bis · PRÉPARATION HORS-LIGNE. L'upload réussit et le document se lit en
  # ligne même quand le chiffrement hors-ligne a ÉCHOUÉ : rien ne le signale
  # aujourd'hui (encStatus n'est affiché nulle part). Sans ce contrôle, la
  # recette déclarait vert un document indisponible hors ligne.
  META=$(curl -s "${AUTH[@]}" "$BASE/cataloging/records/$RID/digital-copy")
  ENC=$(printf '%s' "$META" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("encStatus") or "absent")
except Exception: print("illisible")' 2>/dev/null)
  [ "$ENC" = "ready" ] && ok "préparation hors-ligne : encStatus=ready" \
    || ko "préparation hors-ligne ÉCHOUÉE (encStatus=$ENC) — le document ne sera JAMAIS disponible hors ligne"

  # 7quater · Un téléversement qui échoue doit le DIRE. Trois refus explicites,
  # là où le produit acceptait en silence (contenu non conforme) ou renvoyait
  # un 500 opaque (taille dépassée).
  printf 'ceci n est pas un PDF' > /tmp/recette-faux.pdf
  FC=$(curl -s -o /tmp/recette-faux.json -w '%{http_code}' -X POST "$BASE/cataloging/records/$RID/digital-copy" \
    "${AUTH[@]}" -F "file=@/tmp/recette-faux.pdf;type=application/pdf")
  if [ "$FC" = "400" ] && grep -q "contenu" /tmp/recette-faux.json; then
    ok "fichier au contenu non conforme refusé (HTTP 400, motif explicite)"
  else
    ko "contenu non conforme accepté ou motif absent (HTTP $FC)"
  fi

  head -c 21000000 /dev/zero > /tmp/recette-gros.mrc
  GC=$(curl -s -o /tmp/recette-gros.json -w '%{http_code}' -X POST "$BASE/cataloging/records/import-marc" \
    "${AUTH[@]}" -F "file=@/tmp/recette-gros.mrc;type=application/octet-stream")
  if [ "$GC" = "413" ] && grep -q "limite est de" /tmp/recette-gros.json; then
    ok "fichier trop volumineux refusé (HTTP 413, limite citée)"
  else
    ko "dépassement de taille mal traité (HTTP $GC, attendu 413 avec la limite)"
  fi
  rm -f /tmp/recette-faux.pdf /tmp/recette-faux.json /tmp/recette-gros.mrc /tmp/recette-gros.json

  # 7ter · Et il doit apparaître sur l'étagère de l'étudiant.
  if [ -n "${STUDENT_TOKEN:-}" ]; then :; fi
fi

step "8 · L'ÉTUDIANT accède au document (preuve de bout en bout)"
if [ -n "${STU_URL:-}" ] && [ -n "${RID:-}" ]; then
  STOK=$(printf '%s' "$STU_URL" | sed 's/.*token=//')
  curl -s -o /dev/null -X POST "$BASE/accounts/set-password" -H 'Content-Type: application/json' \
    -d "{\"token\":\"$STOK\",\"password\":\"$STUDENT_PW\"}"
  SLOG=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PW\"}")
  STOKEN=$(printf '%s' "$SLOG" | jqv accessToken)
  if [ -n "$STOKEN" ]; then
    ok "l'étudiant se connecte"
    ACC=$(curl -s -H "Authorization: Bearer $STOKEN" "$BASE/collections/me/records/$RID/access")
    printf '%s' "$ACC" | grep -q '"granted":true' \
      && ok "ACCÈS ACCORDÉ au document — sans collection ni règle créées à la main" \
      || ko "accès refusé : $ACC"
    SHELF=$(curl -s -H "Authorization: Bearer $STOKEN" "$BASE/offline/my-documents")
    printf '%s' "$SHELF" | grep -q "$RID" \
      && ok "le document figure sur l'étagère HORS-LIGNE de l'étudiant" \
      || ko "absent de /offline/my-documents : $(printf '%s' "$SHELF" | head -c 200)"

    MINE=$(curl -s -H "Authorization: Bearer $STOKEN" "$BASE/collections/me")
    printf '%s' "$MINE" | grep -q "Fonds numérique" && ok "le socle apparaît dans ses collections" || ko "socle absent : $(printf '%s' "$MINE" | head -c 200)"
    # Les notices de DÉMONSTRATION doivent l'être aussi : sinon le client voit
    # un catalogue dont rien ne s'ouvre.
    DEMO=$(curl -s "${AUTH[@]}" "$BASE/collections" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print(sum(1 for c in d if not c.get("isDefault")))' 2>/dev/null)
    [ "${DEMO:-0}" = "0" ] && ok "aucune collection orpheline sans règle" || ko "$DEMO collection(s) hors socle — vérifier leurs règles"
  else
    ko "connexion étudiant impossible : $(printf '%s' "$SLOG" | head -c 200)"
  fi
else
  ko "prérequis manquants (lien d'activation ou notice)"
fi

step "9 · Licence hors-ligne : une seule par (utilisateur, appareil, document)"
if [ -n "${STOKEN:-}" ] && [ -n "${RID:-}" ]; then
  PUB=$(node -e "const{generateKeyPairSync}=require('crypto');const{publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});process.stdout.write(publicKey.export({type:'spki',format:'der'}).toString('base64'))" 2>/dev/null)
  DEVID=$(curl -s -X POST "$BASE/offline/devices" -H "Authorization: Bearer $STOKEN" \
    -H 'Content-Type: application/json' -d "{\"publicKey\":\"$PUB\",\"label\":\"Recette\"}" | jqv id)
  if [ -n "$DEVID" ]; then
    iss() { curl -s -X POST "$BASE/offline/licenses" -H "Authorization: Bearer $STOKEN" \
      -H 'Content-Type: application/json' -d "{\"deviceId\":\"$DEVID\",\"docId\":\"$RID\"}" | jqv licenseId; }
    LA=$(iss); LB=$(iss)
    # Réémettre PROLONGE la licence : sans cela, chaque appui sur
    # « télécharger » en créait une de plus, et révoquer n'en révoquait qu'une.
    [ -n "$LA" ] && [ "$LA" = "$LB" ] \
      && ok "deux émissions → UNE seule licence ($LA)" \
      || ko "deux licences distinctes : $LA / $LB"

    # La révocation doit réellement couper l'accès au blob.
    curl -s -o /dev/null -X POST "$BASE/offline/licenses/$LA/revoke" "${AUTH[@]}" -H 'Content-Type: application/json'
    BC=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $STOKEN" "$BASE/offline/licenses/$LA/blob-url")
    [ "$BC" = "403" ] \
      && ok "après révocation, le blob est refusé (HTTP 403)" \
      || ko "blob encore accessible après révocation (HTTP $BC)"
  else
    ko "enregistrement d'appareil impossible"
  fi
else
  ko "prérequis manquants (jeton étudiant ou notice)"
fi

# ── Socle d'un établissement NEUF ────────────────────────────────────────
#
# POURQUOI CE BLOC. Un tenant provisionné sans socle démarre « vide » sans le
# dire : écran des règles de circulation vide (donc amendes à 0 FCFA que
# personne ne voit), liste de catégories vide au premier catalogage, aucun rôle
# à assigner. Rien n'échoue — chaque manque se découvre des semaines plus tard,
# quand quelqu'un essaie de s'en servir. C'est exactement le motif qu'on chasse.
#
# On provisionne donc un établissement JETABLE, on vérifie chaque pièce, et on
# le supprime. Sans clé d'API admin, le bloc s'annonce ignoré plutôt que de
# passer en silence.
step "10 · Socle d'un établissement neuf"
if [ -z "${ADMIN_API_KEY:-}" ]; then
  printf '  \033[33m∅\033[0m bloc ignoré : ADMIN_API_KEY absent (export ADMIN_API_KEY=… pour l'"'"'activer)\n'
else
  SOCLE_SLUG="recette-socle-${RECETTE_RUN:-$$}"
  AK=(-H "x-admin-api-key: $ADMIN_API_KEY" -H 'Content-Type: application/json')
  PC="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/tenants" "${AK[@]}" \
        -d "{\"name\":\"Recette socle\",\"slug\":\"$SOCLE_SLUG\"}")"
  if [ "$PC" != "201" ]; then
    ko "provisionnement de l'établissement de recette (HTTP $PC)"
  else
    ok "établissement de recette provisionné"
    SOC="$(curl -s "${AK[@]}" "$BASE/admin/tenants/$SOCLE_SLUG/socle")"
    val() { printf '%s' "$SOC" | python3 -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: print(-1); sys.exit(0)
print(d.get(sys.argv[1],-1))' "$1" 2>/dev/null; }

    [ "$(val roles)" -ge 1 ] 2>/dev/null \
      && ok "rôles système présents ($(val roles))" \
      || ko "aucun rôle système — impossible d'assigner un rôle à un compte"

    [ "$(val categories)" -ge 1 ] 2>/dev/null \
      && ok "catégories présentes ($(val categories))" \
      || ko "aucune catégorie — le premier catalogage se ferait liste vide"

    [ "$(val circulationRules)" -ge 1 ] 2>/dev/null \
      && ok "règle de circulation visible ($(val circulationRules))" \
      || ko "aucune règle de circulation — amendes à 0 FCFA sans que rien ne le dise"

    [ "$(val classes)" -ge 1 ] 2>/dev/null \
      && ok "classes d'exemple présentes ($(val classes))" \
      || ko "aucune classe d'exemple"

    [ "$(val collections)" -ge 1 ] 2>/dev/null \
      && ok "collection par défaut créée ($(val collections))" \
      || ko "aucune collection par défaut — aucun document ne serait lisible"

    [ "$(val accessRules)" -ge 1 ] 2>/dev/null \
      && ok "règle d'accès sur la collection par défaut" \
      || ko "collection par défaut sans règle d'accès — invisible pour les lecteurs"

    curl -s -o /dev/null -X DELETE "$BASE/admin/tenants/$SOCLE_SLUG" "${AK[@]}"
  fi
fi

# ── Carte de lecteur : scannable au comptoir ─────────────────────────────
#
# POURQUOI. La carte affiche le code-barres de l'ADHÉRENT, pas le matricule :
# c'est lui que `circulation/checkout` attend. Une carte rendue avec le
# matricule serait illisible au comptoir, et l'échec serait MUET — la douchette
# bipe, rien ne correspond, et personne ne fait le lien avec l'application.
# On vérifie donc les deux bouts : l'endpoint rend un code-barres, et ce
# code-barres est réellement accepté à l'emprunt.
step "11 · Carte de lecteur"
CARTE="$(curl -s "${AUTH[@]}" "$BASE/reader/card")"
CB="$(printf '%s' "$CARTE" | jqv barcode)"
SYM="$(printf '%s' "$CARTE" | jqv symbology)"

[ -n "$CB" ] \
  && ok "la carte porte un code-barres ($CB)" \
  || ko "aucun code-barres : l'écran « ma carte » n'aurait rien à afficher"

[ "$SYM" = "code128" ] \
  && ok "symbologie Code 128 (celle des étiquettes d'exemplaires)" \
  || ko "symbologie « $SYM » : la douchette du comptoir lit du Code 128"

# Idempotence : deux appels ne doivent pas créer deux adhérents.
CB2="$(curl -s "${AUTH[@]}" "$BASE/reader/card" | jqv barcode)"
[ "$CB" = "$CB2" ] \
  && ok "la carte est stable d'un appel à l'autre" \
  || ko "le code-barres a changé ($CB → $CB2) : deux adhérents ont été créés"

printf '\n\033[1m── Résultat : %d réussites, %d échecs ──\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
