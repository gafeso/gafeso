#!/usr/bin/env bash
# controles-de-contenu.sh — LES CONTRÔLES DE CONTENU, EN UN SEUL ENDROIT.
#
# ⭐⭐ POURQUOI CE FICHIER EXISTE
#
# Ces contrôles vivaient UNIQUEMENT dans le corps du crochet `pre-commit`, posé
# par `installer-crochets.sh`. Deux conséquences, mesurées le 12 octobre 2026 :
#
#   1. `git commit --no-verify` les saute, et **rien en aval ne les rejoue**. Un
#      contournement local passait donc inaperçu pour toujours.
#   2. Un crochet non installé est indiscernable d'un crochet contourné. Une
#      autre session, un clone frais, une CI : aucun ne les exécutait.
#
# > ⭐ Un garde qui ne vit que dans `.git/hooks/` protège UN clone. Et son vert
# > n'est pas une mesure : c'est l'absence de mesure.
#
# D'où ce script, VERSIONNÉ, appelé par TROIS chemins — le crochet, la CI, et la
# main. C'est « le même script », au sens littéral : il n'y a plus de copie à
# tenir d'accord.
#
# Usage :
#   controles-de-contenu.sh --index              # ce qui est INDEXÉ (crochet)
#   controles-de-contenu.sh --plage <base>       # ce qui a changé depuis <base> (CI de PR)
#   controles-de-contenu.sh --tout               # TOUT l'arbre suivi (CI de main)
set -uo pipefail

ROUGE=$'\033[0;31m'; ORANGE=$'\033[0;33m'; GRIS=$'\033[0;90m'; VERT=$'\033[0;32m'; FIN=$'\033[0m'

# ⚠ LA RACINE SE MESURE AVANT D'Y ALLER, et `cd ""` NE SUFFIT PAS À LE DIRE.
#
# Trouvé le 13 octobre 2026 en posant un témoin pour un avertissement SC2164.
# ⚠ (Et la ligne précédente ne COMMENCE pas par le nom de l'outil : un
# commentaire qui débute ainsi est une DIRECTIVE pour lui, et il a rendu deux
# erreurs de syntaxe sur ma prose repliée. Un instrument qui lit les
# commentaires comme du code, une fois de plus.)
# Sa correction évidente — `cd "$(git rev-parse …)" || exit` — ne
# protège de RIEN ici : hors d'un dépôt, `git rev-parse` échoue et rend une
# chaîne VIDE, et `cd ""` RÉUSSIT en bash. La branche d'échec n'est jamais
# prise.
#
# ⭐ Et le témoin a trouvé mieux que l'avertissement : lancé hors d'un dépôt, ce
# contrôle sortait en 0 en disant « rien n'a été mesuré ». Il le DISAIT, et son
# code de sortie disait le contraire — or c'est le code que le crochet et la CI
# lisent. Un garde vert sur une population vide est exactement ce que ce dépôt
# passe son temps à débusquer.
RACINE=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$RACINE" ] || ! cd "$RACINE"; then
  printf '%s✗%s hors d\u2019un dépôt git : ce contrôle n\u2019a RIEN mesuré.\n' "$ROUGE" "$FIN"
  exit 1
fi
REFUS=0
refuse() { printf '%s✗%s %s\n' "$ROUGE" "$FIN" "$1"; REFUS=1; }
detail() { printf '   %s%s%s\n' "$GRIS" "$1" "$FIN"; }

MODE="${1:---index}"
BASE="${2:-}"

case "$MODE" in
  --index) FICHIERS=$(git diff --cached --name-only --diff-filter=ACM) ;;
  --plage)
    [ -z "$BASE" ] && { refuse '--plage exige une base (ex. origin/main)'; exit 2; }
    FICHIERS=$(git diff --name-only --diff-filter=ACM "$BASE"...HEAD) ;;
  --tout) FICHIERS=$(git ls-files) ;;
  *) printf 'Usage : %s [--index | --plage <base> | --tout]\n' "$0" >&2; exit 2 ;;
esac

# ⚠ UNE POPULATION VIDE N'EST PAS UN SUCCÈS — elle se DIT. Un garde vert sur rien
# est ce que ce dépôt passe son temps à débusquer.
NB=$(printf '%s' "$FICHIERS" | grep -c . || true)
if [ "$NB" = 0 ]; then
  # ⚠ ET LE VIDE N'A PAS LE MÊME SENS SELON LE MODE — c'est la distinction qui
  # manquait, et elle décide du code de sortie :
  #   --index : rien d'indexé est NORMAL (un commit de fusion, un amend vide).
  #   --tout / --plage : la population ne PEUT pas être vide dans un vrai dépôt.
  #     Un vide y signifie que l'instrument s'est trompé d'arbre ou de base —
  #     donc un REFUS, jamais un avertissement qu'on lira peut-être.
  case "$MODE" in
    --index)
      printf '%s⚠%s rien d\u2019indexé — ce contrôle n\u2019a rien mesuré (normal pour un commit vide).\n' \
        "$ORANGE" "$FIN"
      exit 0 ;;
    *)
      printf '%s✗%s population VIDE en mode %s : impossible dans un vrai dépôt.\n' "$ROUGE" "$FIN" "$MODE"
      printf '   %sce contrôle n\u2019a RIEN mesuré — vérifiez l\u2019arbre et la base avant de croire un vert.%s\n' \
        "$GRIS" "$FIN"
      exit 1 ;;
  esac
fi
printf '%s…%s %s fichier(s) examiné(s) — mode %s\n' "$GRIS" "$FIN" "$NB" "$MODE"

# ══ 1 · Chaînes en forme de secret ════════════════════════════════════════════
# LA RÈGLE, plutôt qu'une liste d'exceptions : UN SECRET NE CONTIENT PAS
# D'ESPACE, et ne commence ni par `\\`, ni par `<`, ni par `{`, ni par `$`.
# Éprouvé sur 13 cas construits : 5 vrais secrets sur 5, 0 faux positif sur 8.
# Le `-i` est là parce que le motif était SENSIBLE À LA CASSE et laissait passer
# `ADMIN_API_KEY = '…'`, la forme la plus probable d'une constante recopiée.
MOTIFS='(password|passwd|secret|token|api[_-]?key|jwt)[[:space:]]*[=:][[:space:]]*['"'"'"][^'"'"'"$<\\{[:space:]][^'"'"'"[:space:]]{6,}['"'"'"]'
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.example|*.md|*test*|*spec*|package-lock.json) continue ;;
  esac
  # ⚠ SEULES LES LIGNES AJOUTÉES en mode index/plage : un crochet doit refuser ce
  # qu'on INTRODUIT. Une ligne suspecte PRÉEXISTANTE bloquait quiconque touchait
  # le fichier, pour une chaîne qu'il n'introduisait pas (incident du 11/09/2026).
  case "$MODE" in
    --index) CONTENU=$(git diff --cached -U0 -- "$f" 2>/dev/null | grep '^+' || true) ;;
    --plage) CONTENU=$(git diff -U0 "$BASE"...HEAD -- "$f" 2>/dev/null | grep '^+' || true) ;;
    # ⚠ EN MODE --tout, on lit le FICHIER ENTIER. C'est volontairement plus
    # large : ce mode existe pour rattraper ce qu'un contournement a laissé
    # passer, et il n'y a plus de « ligne ajoutée » à isoler.
    --tout) CONTENU='' ;;
  esac
  # ⚠ EN MODE --tout ON GREP LE FICHIER, on ne le CHARGE pas : charger un binaire
  # dans une variable produit « ignored null byte in input » à chaque image du
  # dépôt. Et `-I` écarte les binaires, dont le contenu n'a aucun sens ici.
  if [ "$MODE" = --tout ]; then
    TROUVE=$(grep -niIE "$MOTIFS" -- "$f" 2>/dev/null | head -3 || true)
  else
    TROUVE=$(printf '%s' "$CONTENU" | grep -niIE "$MOTIFS" | head -3 || true)
  fi
  if [ -n "$TROUVE" ]; then
    refuse "Chaîne en forme de secret dans : $f"
    printf '%s\n' "$TROUVE" | while read -r l; do detail "${l:0:100}"; done
  fi
done <<< "$FICHIERS"

# ══ 2 · Fichiers d'environnement ══════════════════════════════════════════════
ENVS=$(printf '%s\n' "$FICHIERS" | grep -E '^\.env$|\.env\.(prod|production|local)$' || true)
[ -n "$ENVS" ] && { refuse "Fichier d'environnement suivi :"; printf '%s\n' "$ENVS" | while read -r f; do detail "$f"; done; }

# ══ 3 · Clés et certificats ═══════════════════════════════════════════════════
CLES=$(printf '%s\n' "$FICHIERS" | grep -E '\.(jks|keystore|p12|pfx|pem|key)$' || true)
[ -n "$CLES" ] && { refuse "Clé ou certificat suivi :"; printf '%s\n' "$CLES" | while read -r f; do detail "$f"; done; }

# ══ 4 · Documents bureautiques à la racine ════════════════════════════════════
# C'est ainsi qu'un document concernant un tiers a été versionné par `git add -A`.
BUREAU=$(printf '%s\n' "$FICHIERS" | grep -vE '/' | grep -iE '\.(docx?|xlsx?|pptx?|odt|ods|pdf)$' || true)
[ -n "$BUREAU" ] && { refuse "Document bureautique à la racine :"; printf '%s\n' "$BUREAU" | while read -r f; do detail "$f"; done; }

# ══ 5 · Marqueurs de conflit ══════════════════════════════════════════════════
# ⚠ LES FICHIERS DE LEÇONS SONT EXCLUS : ils CITENT ces marqueurs pour les
# expliquer. Un garde qui crie sur le texte qui le documente se fait désactiver.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    CLAUDE.md|docs/journal.md|docs/passation.md|scripts/installer-crochets.sh|scripts/controles-de-contenu.sh) continue ;;
  esac
  if [ "$MODE" = --index ]; then
    SALE=$(git show ":$f" 2>/dev/null | grep -qIE '^(<<<<<<< |>>>>>>> |=======$)' && echo 1 || true)
  else
    SALE=$(grep -qIE '^(<<<<<<< |>>>>>>> |=======$)' -- "$f" 2>/dev/null && echo 1 || true)
  fi
  if [ -n "$SALE" ]; then
    refuse "Marqueurs de conflit dans : $f"
    detail "Résolvez TOUS les blocs (il y en a souvent plus d'un), puis git add."
  fi
done <<< "$FICHIERS"

# ══ 6 · Accents graves dans un heredoc NON QUOTÉ ═════════════════════════════
#
# 🔴 TROUVÉ PAR LA CI PUBLIQUE, le 13 octobre 2026, dans
# `gardes-vivants-en-ci.sh` : son journal portait
#     compte-filtre-exact-en-base.spec.ts: command not found
# Un nom de fichier EXÉCUTÉ. La cause : un COMMENTAIRE écrit à la façon
# Markdown, avec des accents graves autour du nom, à l'intérieur d'un
# `cat > … <<YML` non quoté. Le heredoc doit rester non quoté — il expanse un
# numéro de port — et le shell y évalue donc les accents graves, commentaire
# compris.
#
# ⭐ CE QUI REND LE CAS DIGNE D'UN GARDE plutôt que d'une leçon : rien ne le
# signale. `bash -n` passe, le script s'exécute, le YAML produit est correct, et
# la substitution échoue sur stderr au milieu de cent lignes de compose. Il n'y
# a ni diff, ni test rouge, ni avertissement — seulement une ligne perdue dans
# un journal que personne ne lit tant que tout va bien.
#
# ⚠ Et la tolérance est NOMMÉE : ce fichier-ci et les fichiers de leçons CITENT
# le motif pour l'expliquer. Un garde qui crie sur le texte qui le documente se
# fait désactiver.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.sh) ;;
    *) continue ;;
  esac
  case "$f" in
    scripts/controles-de-contenu.sh) continue ;;
  esac
  if [ "$MODE" = --index ]; then SRC=$(git show ":$f" 2>/dev/null || true)
  else SRC=$(cat -- "$f" 2>/dev/null || true); fi
  [ -z "$SRC" ] && continue
  FAUTIFS=$(printf '%s\n' "$SRC" | awk '
    # un heredoc NON quoté : << ou <<- suivi d un mot nu en fin de ligne
    !dans && /<<-?[A-Za-z_][A-Za-z_0-9]*[[:space:]]*$/ && $0 !~ /<<-?['"'"'"]/ {
      n = $0; sub(/.*<<-?/, "", n); gsub(/[[:space:]]/, "", n)
      dans = 1; fin = n; next
    }
    dans {
      ligne = $0; gsub(/[[:space:]]/, "", ligne)
      if (ligne == fin) { dans = 0; next }
      if (index($0, "`") > 0) printf "%d:%s\n", NR, substr($0, 1, 90)
    }')
  if [ -n "$FAUTIFS" ]; then
    refuse "Accent grave dans un heredoc NON QUOTÉ : $f"
    printf '%s\n' "$FAUTIFS" | while read -r l; do detail "$l"; done
    detail "Le shell y évalue les accents graves, COMMENTAIRE COMPRIS."
    detail "Deux issues : des chevrons « » dans le texte, ou un délimiteur quoté si rien n'a besoin d'être expansé."
  fi
done <<< "$FICHIERS"

# ══ 7 · Archives et gros fichiers ═════════════════════════════════════════════
#
# 🔴 LE 15 OCTOBRE 2026, UN `git add -A` DE MA MAIN A COMMITÉ UNE ARCHIVE DE
# 7,9 Mo DU VOLUME MinIO DE L'INSTANCE DE DÉMONSTRATION — des données de
# production. Elle n'est pas partie : le crochet de pré-PUBLICATION a refusé le
# push, pour une tout autre raison, et ce hasard est la seule chose qui l'a
# arrêtée.
#
# ⚠ ET LE PRE-COMMIT NE L'AVAIT PAS VUE. C'est le moment qui compte : une fois
# l'objet dans l'historique local, il reste lisible à qui a son SHA même après
# `--amend` — le reflog le donne. Il a fallu `reflog expire` + `gc --prune` pour
# le faire disparaître, et c'est une manœuvre qu'on ne veut pas répéter.
#
# ⭐ LE REFUS EST DONC POSÉ ICI, sur le chemin du geste : un motif qui s'est
# produit une fois en silence se barre, il ne s'explique pas.
#
# ⚠ DEUX CRITÈRES, et ils ne se recouvrent pas : une archive de 2 ko est
# refusée pour ce qu'elle EST (un conteneur dont on ne voit pas le contenu), et
# un fichier de 6 Mo pour ce qu'il PÈSE (personne ne relit 6 Mo dans un diff).
ARCHIVES_TOLEREES=(
  # ⚠ Chaque entrée porte son MOTIF. Une tolérance sans raison écrite est la
  # façon élégante de désactiver ce garde.
  #   <chemin>  # <pourquoi il a le droit d'être là>
  'apps/api/test/cross-vector/build.sh'  # pas une archive : le nom finit par .sh
)
GROS_TOLERES=(
  'docs/BiblioCloud - Manuel d’utilisation.pdf'  # 338 ko, sous le seuil — ici pour mémoire
)
MAX_OCTETS=$((5 * 1024 * 1024))

est_tolere() {
  local f=$1 t
  for t in "${ARCHIVES_TOLEREES[@]}" "${GROS_TOLERES[@]}"; do [ "$f" = "$t" ] && return 0; done
  return 1
}

while IFS= read -r f; do
  [ -z "$f" ] && continue
  est_tolere "$f" && continue
  case "$f" in
    *.tar|*.tar.gz|*.tgz|*.tar.bz2|*.tar.xz|*.zip|*.dump|*.bak)
      refuse "Archive ou vidage de base dans ce commit : $f"
      detail 'Les données réelles ne vont JAMAIS dans un dossier du dépôt, même ignoré.'
      detail 'Déposez-les HORS du dépôt (ex. ~/recette-garage/) et passez le chemin'
      detail "en variable d'environnement."
      detail 'Si ce fichier est légitime : ajoutez-le à ARCHIVES_TOLEREES AVEC SON MOTIF.'
      continue ;;
  esac
  # ⚠ `.sql` NE SE JUGE PAS PAR SON EXTENSION, et mon premier jet s'est trompé :
  # il refusait les QUARANTE-DEUX migrations Prisma du dépôt, qui DOIVENT être
  # versionnées. Un détecteur qui signale du code correct se fait désactiver, et
  # il ne sert plus le jour où il a raison.
  #
  # ⭐ Ce qui distingue un VIDAGE d'une migration n'est pas le suffixe : c'est
  # l'EMPLACEMENT (les migrations vivent dans trois dossiers connus) et la
  # TAILLE (mesurée : la plus grosse migration du dépôt fait 16 ko ; un vidage
  # fait des mégaoctets). Deux filets indépendants, et un vidage déposé DANS
  # `migrations/` serait pris par le second.
  case "$f" in
    apps/api/prisma/migrations/*.sql|scripts/migrations/*.sql|scripts/correctifs/*.sql|scripts/*.sql) ;;
    *.sql)
      refuse "Fichier .sql hors des dossiers de migration : $f"
      detail 'Les .sql légitimes vivent dans apps/api/prisma/migrations/,'
      detail 'scripts/migrations/, scripts/correctifs/ ou scripts/.'
      detail "Ailleurs, c'est probablement un VIDAGE de base — et un vidage ne"
      detail 'va jamais dans le dépôt.'
      continue ;;
  esac
  # ⚠ LA TAILLE SE LIT DANS L'INDEX en mode --index, pas sur le disque : c'est
  # ce qui PARTIRAIT qu'on juge. Un fichier réduit après `git add` passerait
  # sinon pour petit.
  if [ "$MODE" = --index ]; then
    TAILLE=$(git cat-file -s "$(git rev-parse ":$f" 2>/dev/null)" 2>/dev/null || echo 0)
  else
    TAILLE=$(wc -c < "$f" 2>/dev/null || echo 0)
  fi
  # ⚠ UN `.sql` DE PLUS D'UN MÉGAOCTET EST UN VIDAGE, où qu'il soit. Le seuil
  # vient d'une mesure : la plus grosse migration du dépôt fait 16 ko, donc un
  # mégaoctet laisse soixante fois la marge et ne peut pas accuser une migration.
  case "$f" in
    *.sql)
      if [ "${TAILLE:-0}" -gt $((1024 * 1024)) ]; then
        refuse "Fichier .sql de $((TAILLE / 1024)) ko : $f"
        detail 'La plus grosse migration de ce dépôt fait 16 ko. Au-delà du'
        detail "mégaoctet, c'est un VIDAGE de base — il ne va pas dans le dépôt."
        continue
      fi ;;
  esac
  if [ "${TAILLE:-0}" -gt "$MAX_OCTETS" ]; then
    refuse "Fichier de $((TAILLE / 1024 / 1024)) Mo : $f"
    detail "Au-delà de 5 Mo, personne ne relit le contenu dans un diff — et un"
    detail "objet entré dans l'historique y reste lisible même après --amend."
    detail 'Si ce fichier est légitime : ajoutez-le à GROS_TOLERES AVEC SON MOTIF.'
  fi
done <<< "$FICHIERS"

# ══ 8 · Compte de fichiers — ce qui a attrapé ce qu'aucun scanner ne voyait ═══
if [ "$MODE" = --index ] && [ "$NB" -gt 30 ]; then
  printf '%s⚠%s %s fichiers dans ce commit — justifiez-les avant de valider.\n' "$ORANGE" "$FIN" "$NB"
fi

if [ "$REFUS" -eq 1 ]; then
  printf '\n%sContrôles de contenu : REFUS.%s\n' "$ROUGE" "$FIN"
  exit 1
fi
printf '%s✓%s contrôles de contenu verts (%s fichier(s))\n' "$VERT" "$FIN" "$NB"
exit 0
