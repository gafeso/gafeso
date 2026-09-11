#!/usr/bin/env bash
# preflight.sh — contrôle de l'environnement avant une session de travail.
#
# Ne modifie rien. Il constate, il compte, il refuse de conclure de ce qu'il
# n'a pas vu. À lancer au début de chaque session, avant de coller un brief.
#
#   ./scripts/preflight.sh
#
# Sort en 1 si un contrôle bloquant échoue.

set -uo pipefail

VERT=$'\033[0;32m'; ROUGE=$'\033[0;31m'; ORANGE=$'\033[0;33m'
GRIS=$'\033[0;90m'; FIN=$'\033[0m'

BLOQUANTS=0
AVERTIS=0

ok()      { printf '  %s✓%s %s\n' "$VERT" "$FIN" "$1"; }
alerte()  { printf '  %s⚠%s %s\n' "$ORANGE" "$FIN" "$1"; AVERTIS=$((AVERTIS+1)); }
bloque()  { printf '  %s✗%s %s\n' "$ROUGE" "$FIN" "$1"; BLOQUANTS=$((BLOQUANTS+1)); }
titre()   { printf '\n%s──%s %s\n' "$GRIS" "$FIN" "$1"; }
detail()  { printf '      %s%s%s\n' "$GRIS" "$1" "$FIN"; }

printf '\n%sContrôle avant session%s  ·  %s\n' "$VERT" "$FIN" "$(date '+%d/%m/%Y %H:%M')"

# ─────────────────────────────────────────────────────── 1 · le bon dépôt
titre "Dépôt"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  bloque "Ce dossier n'est pas un dépôt Git."
  detail "$(pwd)"
  printf '\n%sArrêt : rien d'\''autre ne peut être vérifié.%s\n\n' "$ROUGE" "$FIN"
  exit 1
fi

RACINE=$(git rev-parse --show-toplevel)
ok "Dépôt : $RACINE"

# ── L'origine doit être le dépôt interne, jamais le public.
ORIGINE=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$ORIGINE" ]; then
  bloque "Aucune télécommande « origin »."
  detail "git remote -v pour voir ce qui existe"
elif [[ "$ORIGINE" == *"-internal"* ]]; then
  ok "origin → dépôt interne"
  detail "$ORIGINE"
else
  bloque "origin ne pointe PAS vers un dépôt interne."
  detail "$ORIGINE"
  detail "Un push enverrait le travail interne au mauvais endroit."
fi

# ── Une seule télécommande, sinon on ne sait pas où part un push nu.
NB_REMOTES=$(git remote | wc -l | tr -d ' ')
if [ "$NB_REMOTES" -gt 1 ]; then
  alerte "$NB_REMOTES télécommandes : $(git remote | tr '\n' ' ')"
  detail "Un « git push » sans argument devient ambigu."
fi

# ─────────────────────────────────────────────────────── 2 · la branche
titre "Branche"

BRANCHE=$(git rev-parse --abbrev-ref HEAD)
ATTENDUE="${BRANCHE_ATTENDUE:-main}"

if [ "$BRANCHE" = "$ATTENDUE" ]; then
  ok "Sur « $BRANCHE »"
else
  alerte "Sur « $BRANCHE », attendu « $ATTENDUE »"
  detail "git checkout $ATTENDUE — ou BRANCHE_ATTENDUE=$BRANCHE ./scripts/preflight.sh"
fi

# ── Écart avec l'amont : un travail non poussé s'oublie.
if git rev-parse --abbrev-ref "@{upstream}" >/dev/null 2>&1; then
  if ! git fetch --quiet origin 2>/dev/null; then
    alerte "fetch impossible — état de l'amont inconnu"
  fi
  read -r DERRIERE DEVANT < <(git rev-list --left-right --count "@{upstream}...HEAD" 2>/dev/null || echo "0 0")
  if [ "$DEVANT" -gt 0 ] && [ "$DERRIERE" -gt 0 ]; then
    alerte "Divergence : $DEVANT commit(s) local, $DERRIERE distant"
  elif [ "$DEVANT" -gt 0 ]; then
    alerte "$DEVANT commit(s) non poussé(s)"
    detail "git log --oneline @{upstream}..HEAD"
  elif [ "$DERRIERE" -gt 0 ]; then
    alerte "$DERRIERE commit(s) de retard sur l'amont"
    detail "git pull avant de commencer"
  else
    ok "À jour avec l'amont"
  fi
else
  alerte "La branche ne suit aucun amont"
  detail "git push -u origin $BRANCHE"
fi

# ─────────────────────────────────────────────────────── 3 · l'arbre
titre "Arbre de travail"

MODIFIES=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')
if [ "$MODIFIES" -eq 0 ]; then
  ok "Aucune modification en cours"
else
  alerte "$MODIFIES fichier(s) modifié(s) — travail d'une autre session ?"
  git status --porcelain --untracked-files=no | head -5 | while read -r l; do detail "$l"; done
fi

# ── Fichiers non suivis à la RACINE : c'est ainsi qu'un document d'un tiers
#    a été versionné par un « git add -A ».
NON_SUIVIS_RACINE=$(git ls-files --others --exclude-standard --directory | grep -v '/' | grep -v '^$' || true)
if [ -n "$NON_SUIVIS_RACINE" ]; then
  alerte "Fichiers non suivis à la racine :"
  echo "$NON_SUIVIS_RACINE" | head -5 | while read -r f; do detail "$f"; done
  detail "Un « git add -A » les emporterait."
fi

# ── Doublons de nom entre la racine et docs/ : cause de garde-fous rouges.
for f in $(git ls-files --others --exclude-standard --directory | grep -v '/' | grep '\.md$' || true); do
  [ -f "docs/$f" ] && alerte "Doublon : $f existe à la racine ET dans docs/"
done

# ─────────────────────────────────────────────────────── 4 · les secrets
titre "Secrets"

# Motif témoin d'abord : si la recherche ne trouve pas ce qu'on sait présent,
# son silence ne prouve rien.
TEMOIN=$(git grep -lI "import" -- '*.ts' 2>/dev/null | head -1 || true)
if [ -z "$TEMOIN" ]; then
  alerte "Témoin positif introuvable — la recherche de secrets n'est pas fiable ici"
else
  # ⚠ MÊME MOTIF QUE LE CROCHET pre-commit, et pour les mêmes raisons mesurées le
  # 11 septembre 2026 : un secret ne contient pas d'espace et ne commence ni par
  # `\\`, ni par `<`, ni par `{`, ni par `$` — échappements, balises, gabarits,
  # variables. Et le grep est INSENSIBLE À LA CASSE : sans `-i`,
  # `ADMIN_API_KEY = '…'` passait, c'est-à-dire la forme la plus probable d'une
  # constante d'environnement recopiée par mégarde.
  #
  # Les deux contrôles doivent dire la MÊME chose : un préflight qui passe alors
  # que le commit sera refusé — ou l'inverse — apprend à ignorer l'un des deux.
  MOTIFS='(password|passwd|secret|token|api[_-]?key|jwt)[[:space:]]*[=:][[:space:]]*['"'"'"][^'"'"'"$<\\{[:space:]][^'"'"'"[:space:]]{6,}['"'"'"]'
  TROUVES=$(git grep -InIiE "$MOTIFS" -- \
    ':!*.example' ':!*.md' ':!*test*' ':!*spec*' ':!package-lock.json' 2>/dev/null | head -10 || true)
  if [ -n "$TROUVES" ]; then
    bloque "Chaîne(s) en forme de secret dans les fichiers suivis :"
    echo "$TROUVES" | while read -r l; do detail "${l:0:110}"; done
    detail "Vérifier à l'œil : un faux positif est possible, un vrai ne l'est pas."
  else
    ok "Aucune chaîne en forme de secret (témoin : $TEMOIN)"
  fi
fi

# ── Fichiers d'environnement suivis par erreur.
ENV_SUIVIS=$(git ls-files | grep -E '^\.env$|\.env\.(prod|production|local)$' || true)
if [ -n "$ENV_SUIVIS" ]; then
  bloque "Fichier d'environnement SUIVI par git :"
  echo "$ENV_SUIVIS" | while read -r f; do detail "$f"; done
fi

# ─────────────────────────────────────────────────────── 5 · l'outillage
titre "Outillage"

command -v node >/dev/null && ok "node $(node -v)" || bloque "node absent"
command -v npm  >/dev/null && ok "npm $(npm -v)"   || bloque "npm absent"

if [ -f package.json ] && [ ! -d node_modules ]; then
  alerte "node_modules absent — npm ci avant de commencer"
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    EN_COURS=$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l | tr -d ' ')
    ok "docker actif — $EN_COURS conteneur(s)"
  else
    alerte "docker installé mais le démon ne répond pas"
  fi
fi

# ─────────────────────────────────────────────────────── 6 · les tests
titre "Tests"

if [ "${PREFLIGHT_SANS_TESTS:-}" = "1" ]; then
  alerte "Tests ignorés (PREFLIGHT_SANS_TESTS=1)"
elif [ ! -f package.json ]; then
  alerte "Pas de package.json — rien à exécuter"
else
  printf '  %s…%s exécution en cours\n' "$GRIS" "$FIN"
  SORTIE=$(npm test --silent -- --force 2>&1)
  CODE=$?
  # ⚠ Un script qui rend 0 sans rien exécuter n'est pas une suite verte.
  if [ $CODE -ne 0 ]; then
    bloque "Suite de tests EN ÉCHEC"
    echo "$SORTIE" | tail -12 | while read -r l; do detail "${l:0:110}"; done
  elif echo "$SORTIE" | grep -qiE '(pas de tests|no tests found)' \
       || ! echo "$SORTIE" | grep -qiE '[0-9]+ (passed|tests)'; then
    alerte "La suite sort en 0 SANS avoir exécuté de test"
    detail "Un lanceur muet n'est pas un filet."
  else
    ok "Suite verte"
    echo "$SORTIE" | grep -iE 'test files|tests +[0-9]+ (passed|failed)' | tail -2 \
      | while read -r l; do detail "$l"; done
  fi
fi

# ─────────────────────────────────────────────────────── verdict
printf '\n%s────────────────────────────────%s\n' "$GRIS" "$FIN"
if [ "$BLOQUANTS" -gt 0 ]; then
  printf '%s%d contrôle(s) bloquant(s)%s' "$ROUGE" "$BLOQUANTS" "$FIN"
  [ "$AVERTIS" -gt 0 ] && printf '  ·  %d avertissement(s)' "$AVERTIS"
  printf '\n%sNe pas ouvrir de session avant d'\''avoir traité les bloquants.%s\n\n' "$ROUGE" "$FIN"
  exit 1
elif [ "$AVERTIS" -gt 0 ]; then
  printf '%s%d avertissement(s)%s — lisez-les, puis vous pouvez commencer.\n\n' "$ORANGE" "$AVERTIS" "$FIN"
  exit 0
else
  printf '%sTout est en ordre.%s\n\n' "$VERT" "$FIN"
  exit 0
fi
