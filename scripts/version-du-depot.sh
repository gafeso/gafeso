#!/usr/bin/env bash
# Imprime les deux valeurs que le BUILD doit recevoir, lues de git — jamais tapées.
#
#   V="$(scripts/version-du-depot.sh --exporter)" || exit 1
#   eval "$V"
#   docker compose --env-file .env.prod -f docker/docker-compose.prod.yml build
#
# ⚠ PAS `eval "$(…)"` DIRECTEMENT : cette forme AVALE le code de sortie, donc un
# refus passerait inaperçu et le build produirait une image « non étiquetée » en
# silence. L'affectation, elle, propage le code.
#
# ⚠ POURQUOI PAS `package.json` (mesuré le 6 octobre 2026) : il a porté `0.1.0`
# pendant 759 commits, parce qu'il est tenu à la main. Les trois portent
# désormais `0.0.0-non-publie`, et `version-publiee.spec.ts` refuse qu'ils
# changent — un nombre que personne ne maintient est un littéral périmé, pas une
# version.
#
# ⚠ ET SANS ÉTIQUETTE EXACTE, ON LE DIT. `git describe --tags` sans
# `--exact-match` rendrait `v1.0.0-rc1-3-g4843fff`, qui RESSEMBLE à une version
# et n'en est pas une : le support lirait « rc1 » et chercherait dans le code de
# rc1. Le commit, lui, identifie exactement ce cas-là.
set -euo pipefail
cd "$(dirname "$0")/.."

SANS_ETIQUETTE='non étiquetée'

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  # Pas de dépôt : on ne devine pas. Le build rendra les défauts du Dockerfile.
  version="$SANS_ETIQUETTE"; commit='inconnu'
else
  version="$(git describe --tags --exact-match 2>/dev/null || echo "$SANS_ETIQUETTE")"
  commit="$(git rev-parse --short HEAD)"
  # ⚠ UN ARBRE SALE CONSTRUIRAIT UNE IMAGE QUE L'ÉTIQUETTE NE DÉCRIT PAS — mais
  # les deux formes de saleté n'ont pas le même poids, et les confondre rendait
  # cette alerte inutilisable (mesuré le 6 octobre 2026 : elle criait sur trois
  # fichiers non suivis qu'aucun `COPY` ne prend).
  #
  #   · une modification SUIVIE change ce que le build compile → on REFUSE ;
  #   · un fichier NON SUIVI n'entre que si un `COPY` le prend → on AVERTIT, en
  #     le NOMMANT, parce que c'est à l'humain de savoir s'il est interne.
  #
  # C'est le détecteur qui crie au loup : une alerte qui se déclenche sur du
  # légitime se fait ignorer, et ne sert plus le jour où elle a raison.
  suivis_modifies="$(git status --porcelain --untracked-files=no)"
  non_suivis="$(git ls-files --others --exclude-standard)"
  if [ -n "$suivis_modifies" ]; then
    # ⚠ ON N'ÉMET RIEN SUR LA SORTIE STANDARD ET ON SORT EN 1.
    #
    # La première écriture émettait un fragment `… return 1 2>/dev/null || exit 1`
    # destiné à être évalué. Mesuré le 6 octobre 2026 : dans un shell INTERACTIF,
    # `return` hors fonction échoue et le `exit 1` **tue le shell de
    # l'utilisateur**. Un outil de vérification qui ferme la session de celui qui
    # le lance est pire que pas de vérification.
    #
    # D'où la forme documentée dans DEPLOY.md, qui propage le code sans éval
    # dangereuse — une substitution de commande transmet son code à l'affectation :
    #
    #     V="$(scripts/version-du-depot.sh --exporter)" || exit 1
    #     eval "$V"
    # ⭐ LE MESSAGE DIT QUOI FAIRE, pas seulement ce qui ne va pas.
    #
    # ⚠ Il ne le disait pas, et c'est un refus qu'un exploitant RENCONTRERA :
    # il tombe au milieu d'une montée de version, sur une machine de
    # production, souvent le soir. Nommer les fichiers sans donner d'issue
    # laisse le choix entre comprendre et contourner — et le contournement est
    # toujours plus rapide.
    echo "⚠ REFUSÉ : fichiers suivis modifiés — l'image ne correspondrait pas à « $version » :" >&2
    echo "$suivis_modifies" | sed 's/^/    /' >&2
    echo "" >&2
    echo "  POURQUOI : une étiquette dit « voici exactement ce code ». Avec une" >&2
    echo "  modification locale, l'image porterait un numéro de version qui" >&2
    echo "  désigne autre chose qu'elle — et c'est ce numéro que le support" >&2
    echo "  lira le jour d'une panne." >&2
    echo "" >&2
    echo "  TROIS ISSUES, et la première règle presque tous les cas :" >&2
    echo "" >&2
    echo "  (1) Votre réglage a sa place dans .env.prod, qui n'est PAS suivi." >&2
    echo "      C'est le cas des domaines, des secrets, du SMTP — et du" >&2
    echo "      Caddyfile, qui lit ses domaines depuis l'environnement plutôt" >&2
    echo "      que d'être édité. Pour revenir en état :" >&2
    echo "          git diff -- <fichier>       # ce que vous avez changé" >&2
    echo "          git checkout -- <fichier>   # ATTENTION : ceci le PERD" >&2
    echo "" >&2
    echo "  (2) Le changement est à garder, mais plus tard :" >&2
    echo "          git stash push -m 'mon réglage' -- <fichier>" >&2
    echo "      puis reprenez la montée. (git stash list pour le retrouver.)" >&2
    echo "" >&2
    echo "  (3) Vous maintenez volontairement une variante. Alors ce code n'EST" >&2
    echo "      plus « $version », et le dire est la seule chose honnête :" >&2
    echo "      étiquetez votre propre version, ou acceptez « non étiquetée »" >&2
    echo "      sur /health." >&2
    exit 1
  fi
  if [ -n "$non_suivis" ]; then
    echo "⚠ fichiers NON SUIVIS présents dans le contexte de build (vérifiez .dockerignore) :" >&2
    echo "$non_suivis" | sed 's/^/    /' >&2
  fi
fi

if [ "${1:-}" = '--exporter' ]; then
  printf 'export GAFESO_VERSION=%q\nexport GAFESO_COMMIT=%q\n' "$version" "$commit"
else
  printf 'GAFESO_VERSION=%s\nGAFESO_COMMIT=%s\n' "$version" "$commit"
fi
