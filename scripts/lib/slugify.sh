#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# slugify — dérive un identifiant court (slug) depuis un nom d'établissement.
#
# Fichier SOURÇABLE (pas exécutable directement) :
#     . scripts/lib/slugify.sh
#     slug="$(slugify "Ma Bibliothèque")"   # → ma-bibliotheque
#
# Le slug produit doit être accepté par tenantSchemaName()
# (apps/api/src/tenancy/tenant-schema.ts), qui impose :
#
#     /^[a-z][a-z0-9-]{1,48}$/
#
# soit : une lettre minuscule en tête, puis 1 à 48 caractères parmi
# [a-z0-9-] — donc une longueur TOTALE de 2 à 49. Toute dérivation qui
# sortirait de ce gabarit ferait échouer le provisioning côté serveur
# APRÈS l'installation, ce qui est le pire moment pour l'apprendre.
#
# Repli des diacritiques : `iconv -t ASCII//TRANSLIT` (è→e, ç→c, Œ→OE…).
# En son absence, ou s'il produit des caractères non mappés, l'étape de
# nettoyage qui suit les transforme en tirets : le résultat est dégradé
# mais JAMAIS invalide.
# ─────────────────────────────────────────────────────────────

# Longueur maximale du slug dérivé automatiquement. Volontairement plus
# courte que le maximum autorisé (49) : le slug apparaît dans le nom du
# schéma PostgreSQL (« tenant_<slug> ») et dans les URLs.
SLUGIFY_MAX_LEN="${SLUGIFY_MAX_LEN:-24}"

slugify() {
  local input="$1" out

  # 1) Repli des accents. LC_ALL=C.UTF-8 rend la translittération
  #    déterministe quelle que soit la locale de la machine cliente.
  if command -v iconv >/dev/null 2>&1; then
    out="$(printf '%s' "$input" | LC_ALL=C.UTF-8 iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null)" \
      || out="$input"
    [ -n "$out" ] || out="$input"
  else
    out="$input"
  fi

  # 2) Minuscules.
  out="$(printf '%s' "$out" | tr '[:upper:]' '[:lower:]')"

  # 3) Tout ce qui n'est pas [a-z0-9] devient un tiret (espaces, apostrophes,
  #    ponctuation, et tout résidu non-ASCII laissé par la translittération).
  out="$(printf '%s' "$out" | sed 's/[^a-z0-9]/-/g')"

  # 4) Compacter les tirets consécutifs, puis retirer ceux de bord.
  out="$(printf '%s' "$out" | sed -e 's/--*/-/g' -e 's/^-//' -e 's/-$//')"

  # 5) Le gabarit exige une LETTRE en tête : on retire les chiffres et tirets
  #    initiaux (« 2024-lycee » → « lycee »).
  out="$(printf '%s' "$out" | sed 's/^[0-9-]*//')"

  # 6) Tronquer, puis re-nettoyer le bord droit (la coupe peut tomber sur un
  #    tiret, ce qui produirait « lycee-saint- »).
  out="$(printf '%s' "$out" | cut -c1-"$SLUGIFY_MAX_LEN" | sed 's/-*$//')"

  # 7) Le gabarit exige au moins 2 caractères. En deçà, mieux vaut ne rien
  #    proposer que proposer un défaut invalide : l'appelant demandera.
  if [ "${#out}" -lt 2 ]; then
    printf ''
    return 0
  fi

  printf '%s' "$out"
}

# Validation, alignée AU CARACTÈRE PRÈS sur tenantSchemaName().
slug_is_valid() {
  case "${#1}" in 0|1) return 1 ;; esac
  [ "${#1}" -le 49 ] || return 1
  printf '%s' "$1" | grep -Eq '^[a-z][a-z0-9-]*$'
}
