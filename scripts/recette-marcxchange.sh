#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# Recette — la sortie XML de Gafeso VALIDE contre le schéma officiel
# MarcXchange 2.0 (ISO 25577).
#
# Ce n'est pas une comparaison à vue : la sortie réelle est passée à un
# validateur XSD (javax.xml.validation, JDK) contre une copie du schéma de la
# norme (apps/api/src/cataloging/__fixtures__/marcxchange-2-0.xsd, récupérée
# depuis loc.gov via l'archive publique — loc.gov est derrière un défi
# Cloudflare et refuse les clients non navigateurs).
#
#   ./scripts/recette-marcxchange.sh
#
# CONTRÔLE NÉGATIF — intégré, deux fois :
#   1. une notice au `tag` illégal DOIT être rejetée (sans quoi le validateur ne
#      valide rien) ;
#   2. l'ANCIEN espace de noms MARC21 DOIT être rejeté par ce schéma — c'est la
#      preuve que les deux formats sont bien distincts, et donc que l'ancienne
#      annonce était fausse.
#
# Prérequis : un JDK (java 11+, mode fichier source unique) et `npm run build`
# fait dans apps/api. Aucun réseau.
# ═════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$RACINE/apps/api"
XSD="$API/src/cataloging/__fixtures__/marcxchange-2-0.xsd"
VALIDEUR="$RACINE/scripts/lib/Valider.java"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

vert() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
rouge() { printf '  \033[31m✖ %s\033[0m\n' "$*"; }
ECHECS=0
ko() { rouge "$*"; ECHECS=$((ECHECS + 1)); }

command -v java >/dev/null || { rouge "java introuvable (JDK requis)"; exit 1; }
[ -f "$XSD" ] || { rouge "schéma absent : $XSD"; exit 1; }
[ -d "$API/dist" ] || { rouge "apps/api/dist absent — lancer npm run build"; exit 1; }

valider() { java "$VALIDEUR" "$XSD" "$1" 2>&1; }

# Sortie RÉELLE, produite par le code compilé (pas un extrait écrit à la main).
node -e "
  const m = require('$API/dist/cataloging/marc-export');
  const u = require('$API/dist/cataloging/unimarc-xml');
  const N = {
    id: 'x', title: 'Le droit foncier', titleComplement: 'étude comparée',
    isbn: '9782123456803', publishYear: 2020, language: 'fr',
    publisher: 'Presses', publicationCity: 'Ouagadougou',
    defenseUniversity: 'Université Joseph Ki-Zerbo', defensePlace: 'Ouagadougou',
    category: 'droit', recordType: 'Thèse',
    contributors: [
      { name: 'Ouédraogo, Awa', role: 'AUTEUR_PRINCIPAL', position: 0 },
      { name: 'Sawadogo, Paul', role: 'DIRECTEUR_MEMOIRE', position: 1 },
    ],
    keywords: ['foncier', 'droit'],
    items: [{ barcode: 'ZK-1', callNumber: '346 OUE', location: 'Salle 1', status: 'AVAILABLE' }],
  };
  const fs = require('fs');
  fs.writeFileSync('$TRAVAIL/collection.xml', m.catalogToMarcxchange([N]));
  fs.writeFileSync('$TRAVAIL/notice-oai.xml', u.versMarcxchange(m.recordToMarcxmlElement(N), true));
" || { rouge "génération de la sortie impossible"; exit 1; }

echo
echo "── 1/2 · La sortie réelle valide contre le schéma de la norme"
for cas in "export du bibliothécaire (collection):collection.xml" "notice servie en OAI (GetRecord):notice-oai.xml"; do
  libelle="${cas%%:*}"; fichier="${cas##*:}"
  if [ "$(valider "$TRAVAIL/$fichier")" = "VALIDE" ]; then
    vert "$libelle"
  else
    ko "$libelle → $(valider "$TRAVAIL/$fichier")"
  fi
done
# Le leader MARC21 ne doit plus être écrit (facultatif en 2.0, jamais calculé).
grep -q "<leader>" "$TRAVAIL/collection.xml" \
  && ko "un <leader> est encore émis en XML" \
  || vert "aucun <leader> : Gafeso n'affirme pas un label ISO 2709 qu'il ne calcule pas"

echo
echo "── 2/2 · CONTRÔLE NÉGATIF"
sed 's/tag="010"/tag="0"/' "$TRAVAIL/collection.xml" > "$TRAVAIL/mauvais-tag.xml"
case "$(valider "$TRAVAIL/mauvais-tag.xml")" in
  INVALIDE*) vert "un tag illégal est bien rejeté — le validateur valide vraiment" ;;
  *) ko "un tag illégal PASSE : la recette ne prouve rien" ;;
esac

sed 's#info:lc/xmlns/marcxchange-v2#http://www.loc.gov/MARC21/slim#' \
  "$TRAVAIL/collection.xml" > "$TRAVAIL/ancien-ns.xml"
case "$(valider "$TRAVAIL/ancien-ns.xml")" in
  INVALIDE*) vert "l'ancien espace de noms MARC21 est rejeté — les deux formats sont bien distincts" ;;
  *) ko "l'ancien espace de noms passe encore : les formats ne seraient pas distincts" ;;
esac

echo
if [ "$ECHECS" -eq 0 ]; then
  printf '\033[32mRecette « MarcXchange » : tout est vert.\033[0m\n\n'; exit 0
fi
printf '\033[31mRecette « MarcXchange » : %d échec(s).\033[0m\n\n' "$ECHECS"; exit 1
