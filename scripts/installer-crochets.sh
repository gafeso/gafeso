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

# ── 5 · Marqueurs de conflit laissés dans le contenu indexé.
#
# ⚠ POURQUOI CE CONTRÔLE EXISTE. Le 12 septembre 2026, un `git pull --rebase`
# a produit DEUX blocs de conflit dans `docs/journal.md` — les deux sessions y
# ajoutent leur entrée en fin de fichier. Le script de résolution n'en traitait
# que le PREMIER, `git add` ne vérifie rien, et `git rebase --continue` a
# committé les marqueurs du second sans un mot.
#
# Ce n'est pas une inattention rattrapable par la relecture : le fichier fait
# sept cents lignes, et rien dans le déroulé ne dément. Ce qui l'a attrapé est
# un témoin qui COMPTAIT les marqueurs restants — et le point de passage
# obligé, c'est ici.
#
# La correction n'a coûté qu'un amend parce que rien n'était poussé. Elle ne se
# reprend pas une fois publiée : un `main` qui porte `<<<<<<< HEAD` est vu par
# tout le monde.
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if git show ":$f" 2>/dev/null | grep -qE '^(<<<<<<< |>>>>>>> |=======$)'; then
    refuse "Marqueurs de conflit dans le contenu indexé : $f"
    detail "Résolvez TOUS les blocs (il y en a souvent plus d'un), puis git add."
  fi
done <<< "$INDEXES"

# ── 6 · Compte de fichiers : ce qui a attrapé ce qu'aucun scanner ne voyait.
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
ROUGE=$'\033[0;31m'; ORANGE=$'\033[0;33m'; GRIS=$'\033[0;90m'; VERT=$'\033[0;32m'; FIN=$'\033[0m'

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

# ── 3 · Les gardes VIVANTS — ceux qui interrogent le serveur PostgreSQL.
#
# ⚠ POURQUOI CETTE ÉTAPE EXISTE. Trois gardes gatés `PG_LIVE=1` — le trigger de
# hiérarchie, le vocabulaire des types en base, la dérive des schémas d'école —
# passaient tous, et RIEN ne les lançait : ni `npm test`, ni ce crochet. Ils
# dormaient depuis leur écriture. Un garde que personne ne lance ne garde rien.
#
# ⚠ ET IL FAUT DISTINGUER DEUX ÉCHECS, sinon l'étape est intenable. « La
# propriété est violée » doit REFUSER le push ; « il n'y avait pas de base »
# doit AVERTIR et laisser passer — sinon quiconque pousse depuis une machine
# sans base est bloqué par un garde qui n'a rien constaté.
#
# Les gardes eux-mêmes sortent ROUGES quand la base ne répond pas, et c'est
# voulu : un test qui ne peut pas mesurer n'est pas un test qui passe. C'est
# donc ICI que la distinction se fait, sur la chaîne déclarée dans
# `src/common/base-injoignable.ts` — couplage vérifié par
# `gardes-vivants.spec.ts`, qui refuse qu'un garde la reformule.
INJOIGNABLE='base injoignable : ce test ne mesure rien'

printf '%s…%s gardes vivants (base de développement)\n' "$GRIS" "$FIN"
SORTIE_BASE=$(npm run test:base --silent 2>&1)
CODE_BASE=$?

if [ $CODE_BASE -ne 0 ]; then
  if echo "$SORTIE_BASE" | grep -qF "$INJOIGNABLE" \
     || echo "$SORTIE_BASE" | grep -qiE 'enoent.*\.env|cannot find module .dotenv'; then
    printf '%s⚠%s Base injoignable — les gardes vivants n'\''ont PAS tourné.\n' "$ORANGE" "$FIN"
    printf '   %sLe push passe : ils n'\''ont rien constaté, ils n'\''ont rien pu mesurer.%s\n' "$GRIS" "$FIN"
    printf '   %sPour les lancer : docker compose --env-file .env -f docker/docker-compose.yml up -d%s\n' "$GRIS" "$FIN"
    printf '   %spuis npm run test:base%s\n' "$GRIS" "$FIN"
    exit 0
  fi
  printf '\n%s✗ Un garde vivant a constaté une violation — push refusé.%s\n' "$ROUGE" "$FIN"
  # ⚠ `[Nest]` EST EXCLU : le journal d'AdminService contient une flèche
  # (« École provisionnée : zinda → schéma tenant_zinda ») et passait le filtre,
  # repoussant la vraie cause deux lignes plus bas. Un message de refus dont la
  # première ligne n'est pas la cause se lit mal au moment où il compte.
  echo "$SORTIE_BASE" | grep -E '×|→|AssertionError' | grep -v '\[Nest\]' | head -12 \
    | while read -r l; do printf '   %s%s%s\n' "$GRIS" "${l:0:110}" "$FIN"; done
  printf '\n   %sCe n'\''est pas le code qui est rouge : c'\''est la BASE qui a dérivé.%s\n' "$GRIS" "$FIN"
  printf '   %sSi c'\''est connu et assumé : git push --no-verify%s\n' "$GRIS" "$FIN"
  exit 1
fi

printf '%s✓%s Gardes vivants verts\n' "$VERT" "$FIN"
exit 0
CROCHET

# ══════════════════════════════════════════════════ post-merge / post-checkout
#
# ⚠ POURQUOI CE CROCHET EXISTE. Quatre pushes refusés en deux jours, quatre
# causes différentes — `parentId`, `deposit`, les colonnes de chiffrement,
# `embargoUntil` — et une seule racine : le crochet de pré-push type-vérifie le
# MONOREPO entier, et le client Prisma d'un clone ne se régénère pas tout seul
# quand une migration arrive d'ailleurs. Le message montre alors le fichier de
# quelqu'un d'autre alors que le décalage est chez soi.
#
# La règle du dépôt s'applique : un motif qui se répète n'a pas besoin d'être
# mieux expliqué, il a besoin d'être barré. La note de DEMARRER-FRONT § 2 bis
# reste utile à qui veut comprendre le symptôme ; elle n'est plus le remède.
cat > "$CROCHETS/post-merge" <<'CROCHET'
#!/usr/bin/env bash
# Régénère le client Prisma — mais SEULEMENT si une migration vient d'arriver.
#
# ⚠ DEUX PRÉCAUTIONS, ET ELLES SONT LE CŒUR DU CROCHET.
#
# 1. IL NE TOURNE PAS À CHAQUE MERGE. Régénérer sans raison coûte des secondes à
#    chaque `git pull`, et un crochet qui coûte pour rien finit désinstallé —
#    puis il ne sert plus le jour où il porte. On ne régénère que si le schéma
#    ou une migration a bougé dans ce qui vient d'être fusionné.
# 2. IL DIT CE QU'IL FAIT. Un crochet qui modifie un état partagé en silence est
#    exactement ce que ce dépôt reproche à `dist/` et à `.next/` : on découvre
#    l'effet sans savoir d'où il vient. Il annonce donc ce qui a changé, ce
#    qu'il lance, et le résultat.

set -uo pipefail
VERT=$'\033[0;32m'; ORANGE=$'\033[0;33m'; GRIS=$'\033[0;90m'; FIN=$'\033[0m'

RACINE=$(git rev-parse --show-toplevel)
# `ORIG_HEAD` est la position d'avant la fusion : la comparer à HEAD donne
# exactement ce que ce pull a apporté, et rien d'autre.
AVANT=$(git rev-parse --quiet --verify ORIG_HEAD || echo "")
[ -z "$AVANT" ] && exit 0

CHANGES=$(git diff --name-only "$AVANT" HEAD -- \
  'apps/api/prisma/schema.prisma' 'apps/api/prisma/migrations/**' 2>/dev/null || true)
[ -z "$CHANGES" ] && exit 0

printf '\n%s⟳%s Le schéma Prisma a changé dans ce qui vient d’arriver :\n' "$ORANGE" "$FIN"
printf '%s\n' "$CHANGES" | sed 's/^/    /'
printf '  %sRégénération du client (écrit dans node_modules, aucune connexion à la base)%s\n' "$GRIS" "$FIN"

if (cd "$RACINE/apps/api" && npx --no-install prisma generate >/dev/null 2>&1); then
  printf '%s✓%s Client Prisma régénéré — votre `tsc` connaît les nouvelles colonnes.\n\n' "$VERT" "$FIN"
else
  # ⚠ On n'échoue PAS : un post-merge qui casse laisserait un arbre fusionné et
  # un développeur bloqué. On dit quoi faire, et on rend la main.
  printf '%s⚠%s Régénération impossible. Lancez-la à la main :\n' "$ORANGE" "$FIN"
  printf '    npm run db:generate -w @gafeso/api\n\n'
fi
exit 0
CROCHET

# `git pull --rebase` ne déclenche PAS post-merge : il rejoue les commits, donc
# c'est post-checkout qui passe. Le même crochet sert les deux — et c'est le cas
# le plus fréquent ici, puisque le dépôt travaille en rebase.
cat > "$CROCHETS/post-rewrite" <<'CROCHET'
#!/usr/bin/env bash
# Après un rebase (donc après `git pull --rebase`), même besoin qu'un merge.
set -uo pipefail
exec "$(git rev-parse --git-path hooks)/post-merge"
CROCHET

chmod +x "$CROCHETS/post-merge" "$CROCHETS/post-rewrite"

chmod +x "$CROCHETS/pre-commit" "$CROCHETS/pre-push"

printf '\n%s✓%s Crochets posés dans .git/hooks/\n' "$VERT" "$FIN"
printf '  pre-commit  secrets, .env, clés, documents à la racine, marqueurs de conflit, compte\n'
printf '  pre-push    destination interne, suite verte\n'
printf '  post-merge  client Prisma régénéré SI une migration est arrivée\n'
printf '  post-rewrite  idem après un rebase (donc après git pull --rebase)\n'
printf '\n  Contournement : --no-verify sur commit ou push.\n\n'
