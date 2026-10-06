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
    echo "⚠ REFUSÉ : fichiers suivis modifiés — l'image ne correspondrait pas à « $version » :" >&2
    echo "$suivis_modifies" | sed 's/^/    /' >&2
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
