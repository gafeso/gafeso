#!/usr/bin/env bash
# Tests de slugify() — exécution : bash scripts/lib/slugify.test.sh
#
# Une seule implémentation (celle du shell, utilisée par install.sh) et donc
# une seule suite : pas de risque de dérive entre deux versions du même
# algorithme. Les cas couvrent les diacritiques français, les espaces
# multiples, les apostrophes, et la conformité au gabarit de tenantSchemaName().
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./slugify.sh
. "$DIR/slugify.sh"

pass=0
fail=0

check() { # check "entrée" "attendu"
  local got
  got="$(slugify "$1")"
  if [ "$got" = "$2" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf '  ✖ slugify("%s")\n      attendu : "%s"\n      obtenu  : "%s"\n' "$1" "$2" "$got"
  fi
}

check_valid() { # check_valid "entrée" — le slug produit doit passer le gabarit serveur
  local got
  got="$(slugify "$1")"
  if slug_is_valid "$got"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf '  ✖ slugify("%s") = "%s" — refusé par tenantSchemaName()\n' "$1" "$got"
  fi
}

echo "── Cas de régression (le défaut historique) ──"
check "Ma Bibliothèque"          "ma-bibliotheque"

echo "── Diacritiques : é è ê à ç ──"
check "École"                    "ecole"
check "Bibliothèque"             "bibliotheque"
check "Fête du Livre"            "fete-du-livre"
check "Là-bas"                   "la-bas"
check "Çà et Là"                 "ca-et-la"
check "Université Ouagadougou"   "universite-ouagadougou"
check "Lycée Philippe Zinda"     "lycee-philippe-zinda"
check "Noël"                     "noel"
check "Aïcha"                    "aicha"
check "Hôpital"                  "hopital"

echo "── Espaces multiples et bords ──"
check "École    Normale"         "ecole-normale"
check "  Espaces  autour  "      "espaces-autour"
check "Un   Deux   Trois"        "un-deux-trois"

echo "── Apostrophes et ponctuation ──"
check "Château d'Eau"            "chateau-d-eau"
check "L'Harmattan"              "l-harmattan"
check "Saint-Exupéry"            "saint-exupery"
check "Livres & Savoirs"         "livres-savoirs"
check "Centre (annexe)"          "centre-annexe"

echo "── Troncature à SLUGIFY_MAX_LEN (24), sans tiret orphelin ──"
# 24 caractères pleins, la coupe tombe en plein mot.
check "Université Nationale Supérieure"  "universite-nationale-sup"
# La coupe tombe sur le tiret de la position 24 → il est retiré (23 caractères).
check "Bibliothèque Municipale Centrale"          "bibliotheque-municipale"

echo "── Conformité au gabarit serveur ──"
check "2024 Lycée"               "lycee"          # pas de chiffre en tête
check "---Bizarre---"            "bizarre"        # pas de tiret de bord
check_valid "Ma Bibliothèque"
check_valid "École    Normale"
check_valid "Château d'Eau"
check_valid "Université Ouagadougou"
check_valid "Çà et Là"

echo "── Cas dégénérés : rien plutôt qu'un défaut invalide ──"
check ""                         ""
check "!!!"                      ""
check "7"                        ""
check "é"                        ""

echo
if [ "$fail" -eq 0 ]; then
  printf '✔ slugify : %d assertions, 0 échec\n' "$pass"
  exit 0
fi
printf '✖ slugify : %d échec(s) sur %d assertions\n' "$fail" "$((pass + fail))"
exit 1
