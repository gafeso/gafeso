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
# ⭐⭐ CE CROCHET NE PORTE PLUS LES CONTRÔLES — IL LES DÉLÈGUE.
#
# Les contrôles vivent dans `scripts/controles-de-contenu.sh`, VERSIONNÉ, et la
# CI lance LE MÊME SCRIPT. Avant le 12 octobre 2026 ils ne vivaient qu'ici :
#
#   · `git commit --no-verify` les sautait, et RIEN en aval ne les rejouait ;
#   · un crochet non installé était indiscernable d'un crochet contourné.
#
# > ⭐ Un garde qui ne vit que dans `.git/hooks/` protège UN clone, et son vert
# > n'est pas une mesure : c'est l'absence de mesure.
#
# Contournement toujours possible : `git commit --no-verify`. Il est désormais
# RATTRAPÉ par la CI, qui rejoue le même script sur ce qui est poussé.
set -uo pipefail
ROUGE=$'\033[0;31m'; GRIS=$'\033[0;90m'; FIN=$'\033[0m'
RACINE=$(git rev-parse --show-toplevel)
CONTROLES="$RACINE/scripts/controles-de-contenu.sh"

# ⚠ SI LE SCRIPT MANQUE, ON REFUSE — on ne passe PAS en silence. Un crochet qui
# tolère l'absence de ce qu'il appelle est un faux dispositif : il s'exécute, il
# rend 0, et il ne contrôle rien.
if [ ! -x "$CONTROLES" ]; then
  printf '%s✗ Contrôles introuvables :%s %s\n' "$ROUGE" "$FIN" "$CONTROLES"
  printf '   %sLe crochet délègue à un script versionné. Tirez la branche, ou%s\n' "$GRIS" "$FIN"
  printf '   %srelancez ./scripts/installer-crochets.sh%s\n' "$GRIS" "$FIN"
  exit 1
fi

exec "$CONTROLES" --index
CROCHET
chmod +x "$CROCHETS/pre-commit"

cat > "$CROCHETS/reference-transaction" <<'CROCHET'
#!/usr/bin/env bash
# Refuse `git stash push`. Contournement : GAFESO_STASH=je-sais git stash push
[ "$1" = "prepared" ] || exit 0
[ -n "${GAFESO_STASH:-}" ] && exit 0

ROUGE=$'\033[0;31m'; GRIS=$'\033[0;90m'; FIN=$'\033[0m'
while read -r ancien nouveau ref; do
  [ "$ref" = "refs/stash" ] || continue
  # Suppression (pop/drop) : on laisse TOUJOURS passer.
  case "$nouveau" in *[!0]*) ;; *) continue ;; esac

  printf '%s✗%s `git stash push` est refusé : il DÉPLACE votre travail.\n' "$ROUGE" "$FIN" >&2
  printf '   %sPour LIRE une version antérieure, rien n’a besoin de bouger :%s\n' "$GRIS" "$FIN" >&2
  printf '   %sgit show HEAD:<fichier>      — le contenu d’avant%s\n' "$GRIS" "$FIN" >&2
  printf '   %sgit grep <motif> HEAD        — chercher dans l’arbre committé%s\n' "$GRIS" "$FIN" >&2
  printf '   %sgit diff HEAD -- <fichier>   — ce qui a changé depuis%s\n' "$GRIS" "$FIN" >&2
  printf '   %sSi vous voulez vraiment mettre de côté : GAFESO_STASH=je-sais git stash push%s\n' "$GRIS" "$FIN" >&2
  exit 1
done
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

# ── 1 bis · AUCUN MARQUEUR DE CONFLIT DANS CE que l on pousse.
#
# ⚠ LE pre-commit LE VÉRIFIE DÉJÀ — ET IL A UN TROU EXACTEMENT LÀ OÙ LE DANGER
# SE PRODUIT. `git rebase --continue` N EXÉCUTE PAS pre-commit : le chemin qui
# FABRIQUE les conflits est précisément celui que le garde ne couvre pas.
#
# Mesuré le 15 septembre 2026 : un script de résolution a levé, git add a pris
# le fichier sans un mot, rebase --continue a committé, et main aurait porté un
# marqueur en clair. Ce qui l a attrapé est un COMPTE fait à la main après coup.
#
# Le push est le point de passage qui ne se contourne pas : un main publié qui
# porte un marqueur est vu de tout le monde et ne se reprend plus.
#
# ⚠ Les fichiers de LEÇONS sont exclus : ils CITENT ces marqueurs pour les
# expliquer. Un garde qui crie sur le texte qui le documente se fait désactiver.
SALES=$(git grep -lE '^(<<<<<<< |>>>>>>> |=======$)' HEAD -- . 2>/dev/null \
        | grep -vE 'CLAUDE[.]md|docs/journal[.]md|docs/passation[.]md|installer-crochets[.]sh' || true)
if [ -n "$SALES" ]; then
  printf '\n%s✗ Marqueurs de conflit dans ce qui serait poussé :%s\n' "$ROUGE" "$FIN"
  echo "$SALES" | while read -r f; do printf '   %s%s%s\n' "$GRIS" "$f" "$FIN"; done
  printf '   %sRésolvez TOUS les blocs : il y en a souvent plus d un seul.%s\n' "$GRIS" "$FIN"
  printf '   %s⚠ git add ne regarde pas le contenu : comptez-les ensuite.%s\n' "$GRIS" "$FIN"
  exit 1
fi

# ── 2 · La suite doit être verte.
#    ⚠ Jamais dans la même commande qu'une action : on lit, puis on décide.
#
# ⚠⚠ CETTE ÉTAPE RESSEMBLE À UNE REDONDANCE AVEC L'ÉTAPE 3, ET N'EN EST PAS UNE.
#
# L'étape 3 (`npm run test:base`) relance la suite ENTIÈRE avec `PG_LIVE=1` :
# tout ce que fait l'étape 2, plus les gardes vivants. Le geste qui vient est
# donc de supprimer celle-ci pour gagner du temps. NE LE FAITES PAS.
#
# Quand la base de développement est injoignable — une machine sans Docker, un
# conteneur arrêté —, l'étape 3 AVERTIT et sort en 0, délibérément : un garde
# qui n'a rien pu mesurer ne doit bloquer personne. Sans l'étape 2, plus RIEN
# n'aurait alors vérifié la suite, et le push passerait sur du rouge.
#
# ⚠ Et le temps gagné serait nul ou presque. Mesuré le 22 septembre 2026 par
# `git push --dry-run`, qui exécute ce crochet pour de vrai :
#
#     cache turbo chaud ......... 15,2 s
#     cache turbo invalidé ...... 36,5 s   (le pire cas)
#     dont la suite à froid ..... 18,6 s   (2 610 tests)
#     dont les gardes vivants ... 11,9 s
#
# Une dette a été ouverte le 16 septembre sur « le crochet dépasse deux
# minutes », puis RETIRÉE le 22 après cette mesure : le délai venait de l'outil
# qui lançait la commande, pas d'ici. Un nombre non mesuré survit d'autant mieux
# qu'il est précis.
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

chmod +x "$CROCHETS/pre-commit" "$CROCHETS/pre-push" "$CROCHETS/reference-transaction"

printf '\n%s✓%s Crochets posés dans .git/hooks/\n' "$VERT" "$FIN"
printf '  pre-commit  secrets, .env, clés, documents à la racine, marqueurs de conflit, compte\n'
printf '  pre-push    destination interne, suite verte\n'
printf '  post-merge  client Prisma régénéré SI une migration est arrivée\n'
printf '  post-rewrite  idem après un rebase (donc après git pull --rebase)\n'
printf '  reference-transaction  refuse git stash push (pop/drop restent libres)\n'
printf '\n  Contournement : --no-verify sur commit ou push.\n\n'
