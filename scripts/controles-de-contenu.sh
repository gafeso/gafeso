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

# ══ 7 · Compte de fichiers — ce qui a attrapé ce qu'aucun scanner ne voyait ═══
if [ "$MODE" = --index ] && [ "$NB" -gt 30 ]; then
  printf '%s⚠%s %s fichiers dans ce commit — justifiez-les avant de valider.\n' "$ORANGE" "$FIN" "$NB"
fi

if [ "$REFUS" -eq 1 ]; then
  printf '\n%sContrôles de contenu : REFUS.%s\n' "$ROUGE" "$FIN"
  exit 1
fi
printf '%s✓%s contrôles de contenu verts (%s fichier(s))\n' "$VERT" "$FIN" "$NB"
exit 0
