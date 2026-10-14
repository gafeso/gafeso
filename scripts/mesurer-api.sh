#!/usr/bin/env bash
#
# MESURER L'API DE DÉVELOPPEMENT — et ne jamais conclure à une panne sur une
# seule lecture.
#
# ⚠ POURQUOI CE SCRIPT EXISTE. Le 12 septembre 2026, `GET /opac/provenances` a
# répondu 404. J'ai touché les sources, attendu vingt secondes, constaté que
# `dist/` n'avait pas bougé, et écrit au journal que le watcher avait cessé de
# recompiler. C'était faux : la recompilation était EN COURS, l'API a redémarré
# six minutes plus tard et la route répondait.
#
# La leçon était déjà écrite dans CLAUDE.md — « une mesure prise pendant un
# redémarrage ressemble à une mesure sur une panne » — et je venais de l'écrire
# DEUX FOIS le même soir. Elle n'a rien empêché.
#
# ⚠ CE QUE CE SCRIPT CHANGE, ET CE QU'IL NE CHANGE PAS. Il ne me force à rien :
# une règle écrite ne tient pas contre la forme par défaut, et un script qu'on
# doit penser à lancer est une règle avec une étape de plus. Ce qu'il fait, c'est
# rendre la forme JUSTE plus courte que la forme fautive — une ligne au lieu d'un
# curl suivi d'un raisonnement. C'est le seul levier qui ait tenu jusqu'ici.
#
# Et il remplace un JUGEMENT par une MESURE : au lieu de deviner si le watcher
# est en panne, il lit le journal de démarrage et compare les horodatages.
#
#   ./scripts/mesurer-api.sh /opac/provenances?ids=x
#   ./scripts/mesurer-api.sh -H demo.exemple.bf /opac/records/abc
#
set -uo pipefail
cd "$(dirname "$0")/.." || { echo "impossible d'atteindre la racine du dépôt"; exit 1; }

ROUGE=$'\033[0;31m'; VERT=$'\033[0;32m'; ORANGE=$'\033[0;33m'; GRIS=$'\033[0;90m'; FIN=$'\033[0m'
JOURNAL=/tmp/api-dev.log
PORT=4000
HOTE=localhost
DELAI=45

echec()  { printf '%s✗%s %s\n' "$ROUGE" "$FIN" "$1"; }
detail() { printf '   %s%s%s\n' "$GRIS" "$1" "$FIN"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -H) HOTE="$2"; shift 2;;
    -d) DELAI="$2"; shift 2;;
    *) break;;
  esac
done

CHEMIN="${1:-/health}"

mesurer() {
  curl -s -o /tmp/mesurer-api-corps -w '%{http_code}' -H "Host: $HOTE" \
    "http://127.0.0.1:$PORT$CHEMIN"
}

# ── 1 · Première lecture
CODE=$(mesurer)
printf '%s→%s %s%s  %s\n' "$GRIS" "$FIN" "$CHEMIN" "$GRIS" "$CODE$FIN"

if [ "$CODE" = "200" ]; then
  head -c 300 /tmp/mesurer-api-corps 2>/dev/null; echo
  exit 0
fi

# ── TROIS ÉTATS, PAS DEUX. `000` n'est pas un code HTTP : c'est curl qui n'a
# pas pu se connecter. « L'API refuse » et « il n'y a pas d'API » sont deux
# choses, et les confondre envoie chercher un défaut dans du code que personne
# ne sert.
if [ "$CODE" = "000" ]; then
  echec "Rien ne repond sur le port $PORT — ce n est pas un refus, c est une ABSENCE."
  if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    detail "Quelque chose ecoute pourtant : verifiez le Host [$HOTE]."
  else
    detail "Le serveur de developpement n est pas demarre :"
    detail "npm run dev > /tmp/api-dev.log 2>&1 &"
  fi
  exit 2
fi

# ── 2 · AVANT DE CONCLURE : l'API sert-elle le code qu'on vient d'écrire ?
#
# ⚠ C'est la mesure qui remplace le jugement. Si le dernier démarrage est
# ANTÉRIEUR à la dernière modification de source, l'API sert du code périmé —
# et la réponse qu'on vient de lire ne dit rien du code.
printf '\n%s── Avant de conclure : l'\''API sert-elle le code écrit ?%s\n' "$GRIS" "$FIN"

DERNIERE_SOURCE=$(find apps/api/src -name '*.ts' -newermt '-30 minutes' -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | head -1)
if [ -n "$DERNIERE_SOURCE" ]; then
  printf '   %ssource la plus récente : %s%s\n' "$GRIS" "${DERNIERE_SOURCE#* }" "$FIN"
fi

if [ -f "$JOURNAL" ]; then
  DEMARRAGE=$(grep -a 'Gafeso API démarrée' "$JOURNAL" | tail -1)
  if [ -n "$DEMARRAGE" ]; then
    printf '   %sdernier démarrage : %s%s\n' "$GRIS" "$(echo "$DEMARRAGE" | grep -oE '[0-9]{1,2}:[0-9]{2}:[0-9]{2} [AP]M' | tail -1)" "$FIN"
  fi
  ERREURS=$(tail -200 "$JOURNAL" | grep -acE 'error TS[0-9]+' || true)
  if [ "${ERREURS:-0}" -gt 0 ]; then
    printf '%s⚠%s %s erreur(s) de compilation dans les 200 dernières lignes du journal.\n' "$ORANGE" "$FIN" "$ERREURS"
    printf '   %sCe n'\''est pas une panne de l'\''API : c'\''est du code qui ne compile pas.%s\n' "$GRIS" "$FIN"
    tail -200 "$JOURNAL" | grep -aE 'error TS[0-9]+' | tail -3 | while read -r l; do
      printf '   %s%s%s\n' "$GRIS" "${l:0:120}" "$FIN"
    done
    exit 1
  fi
else
  printf '   %s%s introuvable — impossible de savoir ce que l'\''API sert.%s\n' "$ORANGE" "$JOURNAL" "$FIN"
fi

# ── 3 · LA SECONDE LECTURE, et c'est elle qui ferme le défaut.
printf '\n%s── Seconde lecture dans %ss — une recompilation est plus longue qu'\''on ne croit%s\n' "$GRIS" "$DELAI" "$FIN"
sleep "$DELAI"
CODE2=$(mesurer)

if [ "$CODE2" = "$CODE" ]; then
  printf '%s✗%s %s aux deux lectures — le résultat est STABLE, il peut être rapporté.\n' "$ROUGE" "$FIN" "$CODE2"
  head -c 300 /tmp/mesurer-api-corps; echo
  exit 1
fi

printf '%s⚠%s %s puis %s : la première lecture MESURAIT UN REDÉMARRAGE.\n' "$ORANGE" "$FIN" "$CODE" "$CODE2"
printf '   %sNe rapportez pas la première : elle ne disait rien du code.%s\n' "$GRIS" "$FIN"
[ "$CODE2" = "200" ] && { head -c 300 /tmp/mesurer-api-corps; echo; exit 0; }
exit 1
