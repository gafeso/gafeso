#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# AUTO-CONTRÔLE DE LECTURE — DÉPOSE, RELIT COMME UN NAVIGATEUR, SUPPRIME
#
# 🔴 POURQUOI IL EXISTE. La bascule MinIO → Garage du 21 octobre 2026 a été
# déclarée réussie. Pendant DOUZE JOURS la démonstration n'a servi AUCUN
# document — et tous les contrôles étaient verts, parce que `health`,
# `totalHits` et « copies numériques » interrogent tous LA BASE. La chaîne
# complète n'avait jamais été éprouvée par personne.
#
# ⚠ UN CONTRÔLE QUI SE CONTENTERAIT DE RÉCUPÉRER L'URL SIGNÉE AURAIT VU 200
# ET DÉCLARÉ LA LECTURE BONNE — exactement comme nous. Le navigateur reçoit
# les octets et les JETTE faute de `Access-Control-Allow-Origin`. Ce contrôle
# CROISE donc l'origine : sans cela il ne mesure pas ce qui décide.
#
# ⚠ ET IL LIT DEPUIS L'HÔTE, PAS DEPUIS LE CONTENEUR. L'hôte est DEHORS : sa
# requête traverse Caddy comme celle d'un navigateur. Une lecture faite depuis
# le conteneur `api` pourrait joindre Garage en interne et ne rien prouver de
# l'en-tête — c'est-à-dire manquer précisément le défaut qui nous a eus.
#
#   ./scripts/autocontrole-lecture.sh
#
# Sort 0 si un octet déposé est revenu ET accepté. Sort 1 en NOMMANT la cause.
# ═════════════════════════════════════════════════════════════════════════
set -uo pipefail
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="${GAFESO_ENV_FILE:-$RACINE/.env.prod}"
COMPOSE="${GAFESO_COMPOSE:-$RACINE/docker/docker-compose.prod.yml}"

rouge() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m  %s\033[0m\n' "$*"; }

[ -f "$ENVF" ] || { rouge "✖ $ENVF introuvable."; exit 2; }
# shellcheck disable=SC1090
PUBLIC_DOMAIN="$(grep -E '^PUBLIC_DOMAIN=' "$ENVF" | head -1 | cut -d= -f2-)"
[ -n "$PUBLIC_DOMAIN" ] || { rouge "✖ PUBLIC_DOMAIN absent de $ENVF."; exit 2; }
ORIGINE="https://$PUBLIC_DOMAIN"

dc() { docker compose --env-file "$ENVF" -f "$COMPOSE" "$@"; }

printf '\033[1m── Auto-contrôle de lecture ──\033[0m\n'
gris "origine simulée : $ORIGINE"

# ── ① DÉPOSER (dans le conteneur : lui seul a les clés du stockage) ────────
DEPOT="$(dc exec -T api node scripts/autocontrole-lecture.mjs --deposer 2>&1)" || {
  rouge "✖ DÉPÔT IMPOSSIBLE — le stockage n'accepte pas l'écriture."
  gris "$DEPOT"
  rouge "  Cause probable : stockage injoignable, identifiants refusés, ou bucket absent."
  exit 1
}
CLE=$(printf '%s' "$DEPOT" | sed -n 's/.*"cle":"\([^"]*\)".*/\1/p')
URL=$(printf '%s' "$DEPOT" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
SHA=$(printf '%s' "$DEPOT" | sed -n 's/.*"sha256":"\([^"]*\)".*/\1/p')
if [ -z "$CLE" ] || [ -z "$URL" ] || [ -z "$SHA" ]; then
  rouge "✖ le dépôt n'a pas rendu de JSON exploitable."; gris "$DEPOT"; exit 1
fi
vert "✔ objet d'essai déposé ($CLE)"

nettoyer() {
  dc exec -T api node scripts/autocontrole-lecture.mjs --supprimer "$CLE" >/dev/null 2>&1 \
    && gris "objet d'essai supprimé" \
    || rouge "⚠ l'objet d'essai $CLE n'a PAS pu être supprimé — retirez-le à la main."
}
trap nettoyer EXIT

# ── ② RELIRE COMME UN NAVIGATEUR : même appel, Origine croisée ─────────────
# ⚠ Le code ET l'en-tête dans le MÊME appel : deux appels mesureraient deux
# instants, et l'URL signée pourrait expirer entre les deux.
CORPS=/tmp/autocontrole-$$.bin
ENT="$(curl -sS -D- -o "$CORPS" -H "Origin: $ORIGINE" "$URL" 2>&1)" || {
  rouge "✖ LE STOCKAGE EST INJOIGNABLE DEPUIS L'HÔTE."
  gris "$ENT"
  rouge "  Le domaine de stockage ne répond pas. Vérifiez le DNS, Caddy, et que"
  rouge "  le conteneur du stockage tourne."
  rm -f "$CORPS"; exit 1
}
CODE=$(printf '%s' "$ENT" | awk 'NR==1{print $2}')
ACAO=$(printf '%s' "$ENT" | grep -i '^access-control-allow-origin:' | head -1 | cut -d: -f2- | tr -d ' \r')

if [ "$CODE" != "200" ]; then
  rouge "✖ L'URL SIGNÉE NE SERT PAS LE DOCUMENT (HTTP $CODE)."
  rouge "  Ce n'est PAS un problème de navigateur : les octets ne sont pas partis."
  rouge "  Causes : objet absent du bucket, signature refusée (Host non forcé vers"
  rouge "  le point d'entrée S3 — voir docker/Caddyfile), ou stockage en panne."
  rm -f "$CORPS"; exit 1
fi

if [ -z "$ACAO" ]; then
  rouge "✖ LECTURE CASSÉE DANS LE NAVIGATEUR — et le stockage répond 200."
  rouge "  L'en-tête Access-Control-Allow-Origin MANQUE sur l'URL signée."
  rouge "  Les octets PARTENT et le navigateur les JETTE. C'est le défaut qui a"
  rouge "  laissé la démonstration sans aucun document pendant douze jours, avec"
  rouge "  tous les contrôles verts."
  rouge "  ➜ L'en-tête se pose dans docker/Caddyfile, bloc STORAGE_DOMAIN, sur la"
  rouge "    route /digital-copies/*. MinIO le posait de lui-même ; Garage non."
  rouge "  ➜ Et Caddy ne relit son fichier QUE sur « docker restart » : ni"
  rouge "    « compose up -d caddy » ni « caddy reload » ne l'appliquent."
  rm -f "$CORPS"; exit 1
fi

if [ "$ACAO" != "$ORIGINE" ] && [ "$ACAO" != "*" ]; then
  rouge "✖ L'EN-TÊTE N'AUTORISE PAS CETTE ORIGINE."
  rouge "  Access-Control-Allow-Origin vaut « $ACAO », l'origine est « $ORIGINE »."
  rouge "  Le navigateur jettera le document malgré le 200."
  rm -f "$CORPS"; exit 1
fi

# ── ③ L'OCTET EST-IL VRAIMENT ARRIVÉ ? ────────────────────────────────────
# ⚠ Un 200 avec un corps de la bonne TAILLE mais du mauvais CONTENU existe :
# une page d'erreur XML de S3 en fait partie. On compare l'EMPREINTE.
RECU=$(sha256sum "$CORPS" | cut -d' ' -f1)
rm -f "$CORPS"
if [ "$RECU" != "$SHA" ]; then
  rouge "✖ LES OCTETS REVENUS NE SONT PAS CEUX DÉPOSÉS."
  rouge "  attendu $SHA"
  rouge "  reçu    $RECU"
  rouge "  Le stockage a répondu 200 avec un AUTRE contenu (page d'erreur, objet"
  rouge "  tronqué, mauvais bucket)."
  exit 1
fi

vert "✔ lecture de bout en bout : octets déposés, relus par l'URL publique,"
vert "  acceptés par une origine de navigateur ($ACAO), empreinte identique."
