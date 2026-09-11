#!/usr/bin/env bash
# installer-crochets.sh — pose les crochets Git du dépôt.
#
#   ./scripts/installer-crochets.sh
#
# Les crochets vivent dans .git/hooks/, qui n'est pas versionné : chaque clone
# doit relancer ce script. C'est pourquoi il est lui-même dans le dépôt.
#
# Contournement volontairement possible : git commit --no-verify. Un garde-fou
# qu'on ne peut pas contourner finit contourné autrement, et sans trace.

set -euo pipefail

RACINE=$(git rev-parse --show-toplevel)
CROCHETS="$RACINE/.git/hooks"
VERT=$'\033[0;32m'; FIN=$'\033[0m'

mkdir -p "$CROCHETS"

# ══════════════════════════════════════════════════════════ pre-commit
cat > "$CROCHETS/pre-commit" <<'CROCHET'
#!/usr/bin/env bash
# Refuse un commit qui emporterait un secret ou un fichier qui n'a rien à faire là.
# Contournement : git commit --no-verify

set -uo pipefail
ROUGE=$'\033[0;31m'; ORANGE=$'\033[0;33m'; GRIS=$'\033[0;90m'; FIN=$'\033[0m'
REFUS=0

refuse() { printf '%s✗%s %s\n' "$ROUGE" "$FIN" "$1"; REFUS=1; }
detail() { printf '   %s%s%s\n' "$GRIS" "$1" "$FIN"; }

INDEXES=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$INDEXES" ] && exit 0

# ── 1 · Chaînes en forme de secret, dans le contenu indexé seulement.
#    Le témoin positif est implicite : on cherche dans ce qu'on vient d'écrire.
# ⚠ MOTIF RESSERRÉ DEUX FOIS LE 11 SEPTEMBRE 2026, ET MESURÉ LES DEUX FOIS.
#
# LA RÈGLE, plutôt qu'une liste d'exceptions : UN SECRET NE CONTIENT PAS
# D'ESPACE, et ne commence ni par `\\`, ni par `<`, ni par `{`, ni par `$`.
# Ces quatre débuts sont des échappements, des balises, des gabarits et des
# variables — jamais des identifiants.
#
# Ce que cela écarte, constaté dans ce dépôt :
#   token = '\\n    <resumptionToken/>'        nom d'élément OAI-PMH
#   { token: '{prenom}', … }                  gabarit de rappel (5 fois)
#   password: 'Mot de passe oublié ?'         libellé d'interface
#
# ⚠ ET LE TROU QUE LA MESURE A RÉVÉLÉ, plus grave que les faux positifs : le
# motif était SENSIBLE À LA CASSE. `ADMIN_API_KEY = '…'` passait — c'est-à-dire
# la forme la plus probable d'une constante d'environnement recopiée par
# mégarde. D'où le `-i` sur le grep.
#
# Éprouvé sur 13 cas construits : 5 vrais secrets sur 5, 0 faux positif sur 8.
# Un détecteur qui crie au loup se fait contourner par --no-verify, puis par
# habitude, et ne sert plus le jour où il a raison.
MOTIFS='(password|passwd|secret|token|api[_-]?key|jwt)[[:space:]]*[=:][[:space:]]*['"'"'"][^'"'"'"$<\\{[:space:]][^'"'"'"[:space:]]{6,}['"'"'"]'
while IFS= read -r f; do
  case "$f" in
    *.example|*.md|*test*|*spec*|package-lock.json) continue ;;
  esac
  # ⚠ SEULES LES LIGNES AJOUTÉES, PAS LE FICHIER INDEXÉ EN ENTIER.
  #
  # Troisième incident de cohabitation, 11 septembre 2026. Le crochet lisait
  # `git show ":$f"` — le fichier complet. Une ligne SUSPECTE ET PRÉÉXISTANTE
  # bloquait donc quiconque touchait ce fichier, pour une chaîne qu'il
  # n'introduisait pas. Invisible depuis la session qui avait déjà commité ce
  # fichier : chez elle, la même ligne passait.
  #
  # Un scanner de pré-commit doit refuser ce qu'on INTRODUIT. `-U0` ne donne que
  # les lignes ajoutées ; le `^+` les isole (et `^+++` est écarté par le motif
  # lui-même, qui exige un `=` ou un `:`).
  TROUVE=$(git diff --cached -U0 -- "$f" 2>/dev/null | grep '^+' | grep -niIE "$MOTIFS" | head -3 || true)
  if [ -n "$TROUVE" ]; then
    refuse "Chaîne en forme de secret AJOUTÉE dans : $f"
    echo "$TROUVE" | while read -r l; do detail "${l:0:100}"; done
  fi
done <<< "$INDEXES"

# ── 2 · Fichiers d'environnement.
ENVS=$(echo "$INDEXES" | grep -E '^\.env$|\.env\.(prod|production|local)$' || true)
[ -n "$ENVS" ] && { refuse "Fichier d'environnement indexé :"; echo "$ENVS" | while read -r f; do detail "$f"; done; }

# ── 3 · Clés et certificats.
CLES=$(echo "$INDEXES" | grep -E '\.(jks|keystore|p12|pfx|pem|key)$' || true)
[ -n "$CLES" ] && { refuse "Clé ou certificat indexé :"; echo "$CLES" | while read -r f; do detail "$f"; done; }

# ── 4 · Documents bureautiques à la racine.
#    C'est ainsi qu'un document concernant un tiers a été versionné par git add -A.
BUREAU=$(echo "$INDEXES" | grep -vE '/' | grep -iE '\.(docx?|xlsx?|pptx?|odt|ods|pdf)$' || true)
[ -n "$BUREAU" ] && { refuse "Document bureautique à la racine :"; echo "$BUREAU" | while read -r f; do detail "$f"; done; }

# ── 5 · Compte de fichiers : ce qui a attrapé ce qu'aucun scanner ne voyait.
NB=$(echo "$INDEXES" | wc -l | tr -d ' ')
if [ "$NB" -gt 30 ]; then
  printf '%s⚠%s %s fichiers dans ce commit — justifiez-les avant de valider.\n' "$ORANGE" "$FIN" "$NB"
fi

if [ "$REFUS" -eq 1 ]; then
  printf '\n%sCommit refusé.%s Si c'\''est un faux positif : git commit --no-verify\n' "$ROUGE" "$FIN"
  exit 1
fi
exit 0
CROCHET

# ══════════════════════════════════════════════════════════ pre-push
cat > "$CROCHETS/pre-push" <<'CROCHET'
#!/usr/bin/env bash
# Refuse un push si la suite de tests est rouge, ou si la destination est le
# dépôt public. Contournement : git push --no-verify

set -uo pipefail
ROUGE=$'\033[0;31m'; GRIS=$'\033[0;90m'; VERT=$'\033[0;32m'; FIN=$'\033[0m'

DESTINATION="${2:-}"

# ── 1 · Jamais vers le dépôt public depuis le dépôt de travail.
if [ -n "$DESTINATION" ] && [[ "$DESTINATION" != *"-internal"* ]]; then
  printf '%s✗ Destination inattendue :%s %s\n' "$ROUGE" "$FIN" "$DESTINATION"
  printf '   %sLe dépôt de travail ne pousse que vers l'\''interne.%s\n' "$GRIS" "$FIN"
  printf '   %sUn instantané public se dérive, il ne se pousse pas.%s\n' "$GRIS" "$FIN"
  exit 1
fi

# ── 2 · La suite doit être verte.
#    ⚠ Jamais dans la même commande qu'une action : on lit, puis on décide.
printf '%s…%s exécution de la suite avant publication\n' "$GRIS" "$FIN"
SORTIE=$(npm test --silent 2>&1)
CODE=$?

if [ $CODE -ne 0 ]; then
  printf '\n%s✗ Suite en échec — push refusé.%s\n' "$ROUGE" "$FIN"
  echo "$SORTIE" | tail -15 | while read -r l; do printf '   %s%s%s\n' "$GRIS" "${l:0:110}" "$FIN"; done
  printf '\n   %sSi le rouge est antérieur et connu : git push --no-verify%s\n' "$GRIS" "$FIN"
  exit 1
fi

# ── Un script qui rend 0 sans rien exécuter n'est pas une suite verte.
if echo "$SORTIE" | grep -qiE '(pas de tests|no tests found)'; then
  printf '%s⚠%s Un workspace sort en 0 sans exécuter de test.\n' "$ROUGE" "$FIN"
fi

printf '%s✓%s Suite verte\n' "$VERT" "$FIN"
exit 0
CROCHET

chmod +x "$CROCHETS/pre-commit" "$CROCHETS/pre-push"

printf '\n%s✓%s Crochets posés dans .git/hooks/\n' "$VERT" "$FIN"
printf '  pre-commit  secrets, .env, clés, documents à la racine, compte de fichiers\n'
printf '  pre-push    destination interne, suite verte\n'
printf '\n  Contournement : --no-verify sur commit ou push.\n\n'
