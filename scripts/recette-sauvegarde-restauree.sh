#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# UNE SAUVEGARDE JAMAIS RESTAURÉE N'EST PAS UNE SAUVEGARDE.
#
# Cette recette sauvegarde, DÉTRUIT, restaure, et COMPARE. Sur une base jetable,
# jamais sur une instance en service.
#
# ⚠ CE QU'ELLE A TROUVÉ À SA PREMIÈRE EXÉCUTION, et c'est le motif de son
# existence : `backup.sh` appelle `pg_dump` SANS `--clean`, et
# `scripts/backup/README.md` documentait de verser le dump dans la base
# EXISTANTE. Un dump sans `--clean` versé dans une base peuplée produit un
# « already exists » sur chaque table et des `COPY` qui dupliquent ou violent
# les contraintes. **La restauration documentée ne restaurait pas** — et ça ne
# se découvre qu'en restaurant.
#
# ⚠ Elle dépend de Docker, comme `backup.sh` : le client `pg_dump` n'est pas sur
# l'hôte. Le conteneur se nomme par `RECETTE_DB_CONTENEUR` (défaut : celui du
# développement).
#
# Usage : bash scripts/recette-sauvegarde-restauree.sh
set -uo pipefail

ROUGE=$'\033[0;31m'; VERT=$'\033[0;32m'; GRIS=$'\033[0;90m'; JAUNE=$'\033[0;33m'; FIN=$'\033[0m'
ok()     { printf '%s✓%s %s\n' "$VERT" "$FIN" "$1"; }
info()   { printf '%s   %s%s\n' "$GRIS" "$1" "$FIN"; }
alerte() { printf '%s⚠%s %s\n' "$JAUNE" "$FIN" "$1"; }
titre()  { printf '\n%s── %s%s\n' "$GRIS" "$1" "$FIN"; }
FAUTES=0
echec()  { printf '%s✗ %s%s\n' "$ROUGE" "$1" "$FIN"; FAUTES=$((FAUTES+1)); }

CONTENEUR="${RECETTE_DB_CONTENEUR:-bibliocloud-db-1}"
docker inspect "$CONTENEUR" >/dev/null 2>&1 \
  || { echec "conteneur « $CONTENEUR » introuvable — nommez-le par RECETTE_DB_CONTENEUR."; exit 1; }

[ -f .env ] && set -a && . ./.env && set +a
U="${POSTGRES_USER:-bibliocloud}"
JETABLE="gafeso_restaure_$(date +%s)"
BAC="$(mktemp -d)"
trap 'rm -rf "$BAC"' EXIT

psql() { docker exec -i "$CONTENEUR" psql -U "$U" -v ON_ERROR_STOP=1 -tAc "$1" "${2:-postgres}"; }

recensement() { psql "SELECT datname FROM pg_database WHERE datistemplate = false" | sort; }
AVANT="$(recensement)"
info "$(printf '%s' "$AVANT" | wc -l) bases au recensement de départ"

titre "Une base jetable, avec des données qu'on saura reconnaître"
psql "CREATE DATABASE \"$JETABLE\""
docker exec -i "$CONTENEUR" psql -U "$U" -v ON_ERROR_STOP=1 -d "$JETABLE" >/dev/null <<SQL
CREATE TABLE comptes (id serial PRIMARY KEY, email text UNIQUE NOT NULL, actif boolean NOT NULL);
INSERT INTO comptes (email, actif) VALUES
  ('admin@temoin.bf', true), ('bib@temoin.bf', true), ('etudiant@temoin.bf', false);
CREATE TABLE notices (id serial PRIMARY KEY, titre text NOT NULL);
INSERT INTO notices (titre) SELECT 'Notice ' || g FROM generate_series(1, 25) g;
SQL
EMPREINTE_AVANT="$(psql "SELECT md5(string_agg(email || ':' || actif, '|' ORDER BY email)) FROM comptes" "$JETABLE")"
NOTICES_AVANT="$(psql "SELECT count(*) FROM notices" "$JETABLE")"
ok "3 comptes, $NOTICES_AVANT notices — empreinte ${EMPREINTE_AVANT:0:12}…"

titre "Sauvegarde, avec les options EXACTES de backup.sh"
# ⚠ ON INTERROGE LE SCRIPT sur la propriété qui compte, au lieu de recopier ses
# options. Ma première version les extrayait par grep et capturait la barre de
# continuation — pg_dump refusait, et la recette échouait sur MON instrument.
# L'assertion nommée est plus courte et elle dit quelque chose.
if grep -qE 'pg_dump[^|]*--clean' scripts/backup/backup.sh; then
  ok "backup.sh emploie --clean : l'archive porte son propre nettoyage"
  AVEC_CLEAN=1
else
  alerte "backup.sh n'emploie PAS --clean — l'archive ne nettoie rien avant de se verser."
  info "C'est la propriété que la restauration ci-dessous va éprouver."
  AVEC_CLEAN=0
fi
# Les mêmes options EFFECTIVES que backup.sh : `-U <user> <db>`, rien de plus.
if [ "$AVEC_CLEAN" = 1 ]; then
  docker exec -i "$CONTENEUR" pg_dump -U "$U" --clean --if-exists "$JETABLE" | gzip > "$BAC/db.sql.gz"
else
  docker exec -i "$CONTENEUR" pg_dump -U "$U" "$JETABLE" | gzip > "$BAC/db.sql.gz"
fi
[ "${PIPESTATUS[0]:-1}" -eq 0 ] || echec "pg_dump a échoué"
TAILLE=$(stat -c%s "$BAC/db.sql.gz")
ok "archive de $TAILLE octets"
gzip -dc "$BAC/db.sql.gz" | grep -q 'PostgreSQL database dump' || echec "en-tête absent"

titre "⚠ ON DÉTRUIT — c'est le seul geste qui prouve quelque chose"
docker exec -i "$CONTENEUR" psql -U "$U" -v ON_ERROR_STOP=1 -d "$JETABLE" >/dev/null <<'SQL'
DELETE FROM comptes;
DROP TABLE notices;
SQL
RESTE="$(psql "SELECT count(*) FROM comptes" "$JETABLE")"
[ "$RESTE" = "0" ] && ok "les comptes sont effacés, la table des notices est tombée" \
  || echec "la destruction n'a pas eu lieu — la suite ne mesurerait rien"

titre "Restauration, PAR LA PROCÉDURE DOCUMENTÉE"
SORTIE_RESTAURE="$BAC/restauration.log"
gzip -dc "$BAC/db.sql.gz" \
  | docker exec -i "$CONTENEUR" psql -U "$U" -d "$JETABLE" > "$SORTIE_RESTAURE" 2>&1
CODE=$?
ERREURS="$(grep -ciE '^(ERROR|ERREUR)' "$SORTIE_RESTAURE" || true)"
info "code de sortie $CODE, $ERREURS erreur(s) SQL"
if [ "${ERREURS:-0}" -gt 0 ]; then
  alerte "les premières erreurs :"
  grep -iE '^(ERROR|ERREUR)' "$SORTIE_RESTAURE" | head -3 | sed 's/^/     /'
fi

titre "⭐ LES COMPTES SONT-ILS REVENUS, ET LES MÊMES ?"
EMPREINTE_APRES="$(psql "SELECT coalesce(md5(string_agg(email || ':' || actif, '|' ORDER BY email)), '(table vide)') FROM comptes" "$JETABLE" 2>/dev/null || echo '(table absente)')"
NOTICES_APRES="$(psql "SELECT count(*) FROM notices" "$JETABLE" 2>/dev/null || echo '(table absente)')"
[ "$EMPREINTE_APRES" = "$EMPREINTE_AVANT" ] \
  && ok "les 3 comptes sont IDENTIQUES — empreinte retrouvée" \
  || echec "les comptes DIFFÈRENT : avant ${EMPREINTE_AVANT:0:12}… après ${EMPREINTE_APRES:0:12}…"
[ "$NOTICES_APRES" = "$NOTICES_AVANT" ] \
  && ok "$NOTICES_APRES notices, comme avant" \
  || echec "notices : $NOTICES_AVANT avant, $NOTICES_APRES après"
# ⚠ « AUCUNE ERREUR » NE VEUT RIEN DIRE SEUL, et cette recette l'a appris à ses
# dépens : sur une archive VIDE (20 octets, produite par un pg_dump en échec),
# `psql` sort en 0 et ne signale rien. La procédure documentée ne donne donc
# AUCUN signal quand l'archive est mauvaise.
#
# Le code de sortie et le compte d'erreurs ne valent que CONJOINTEMENT avec la
# comparaison des données ci-dessus — c'est elle qui mesure.
if [ "${ERREURS:-0}" -eq 0 ] && [ "$EMPREINTE_APRES" = "$EMPREINTE_AVANT" ]; then
  ok "aucune erreur SQL, ET les données sont revenues — les deux ensemble"
elif [ "${ERREURS:-0}" -eq 0 ]; then
  echec "AUCUNE erreur SQL et pourtant RIEN n'est revenu : la restauration est
     SILENCIEUSE en échec. C'est le pire des deux cas — l'exploitant lit un
     succès et croit son instance rétablie."
else
  echec "$ERREURS erreur(s) SQL pendant la restauration"
fi

titre "Nettoyage, par DIFFÉRENCE d'ensembles"
psql "DROP DATABASE IF EXISTS \"$JETABLE\" WITH (FORCE)" >/dev/null
APRES="$(recensement)"
SURNUMERAIRES="$(comm -13 <(printf '%s\n' "$AVANT") <(printf '%s\n' "$APRES"))"
[ -z "$SURNUMERAIRES" ] && ok "aucune base en plus du recensement de départ" \
  || echec "base(s) survivante(s) : $SURNUMERAIRES"

printf '\n'
[ "$FAUTES" -eq 0 ] && { ok "⭐ LA SAUVEGARDE SE RESTAURE."; exit 0; } \
  || { echec "$FAUTES vérification(s) en échec"; exit 1; }
