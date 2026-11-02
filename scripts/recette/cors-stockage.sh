#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# ÉPREUVE — L'EN-TÊTE CORS DU STOCKAGE, AVEC SON CONTRÔLE NÉGATIF
#
# Pourquoi cette épreuve existe, et ce qu'elle a coûté de ne pas l'avoir :
# la bascule MinIO → Garage du 21 octobre 2026 a été déclarée réussie.
# Pendant DOUZE JOURS la démonstration n'a servi AUCUN document, et tous les
# contrôles étaient verts. Garage répondait `"status":200` — les octets
# partaient — et le navigateur les JETAIT, faute de
# `Access-Control-Allow-Origin`. MinIO posait cet en-tête de lui-même.
#
# ⚠ ELLE TOURNE SUR UNE PILE JETABLE, avec le Caddyfile RÉEL du dépôt. Elle
# ne touche à aucune installation, ne publie aucun port durable, et démonte
# tout en sortant — y compris en échec.
#
#   ./scripts/recette/cors-stockage.sh
# ═════════════════════════════════════════════════════════════════════════
set -uo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PROJET=cors-stockage-jetable
PORT="${CORS_PORT:-18447}"
BAC="$(mktemp -d)"
PASS=0; FAIL=0
ok() { printf '  \033[32m✔\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
ko() { printf '  \033[31m✖\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }

nettoyer() {
  docker rm -f "$PROJET-caddy" "$PROJET-amont" >/dev/null 2>&1
  docker network rm "$PROJET-net" >/dev/null 2>&1
  # ⚠ Caddy écrit ses certificats en root dans le bac : on les retire DANS un
  # conteneur, sinon `rm` échoue et le bac reste.
  docker run --rm -v "$BAC":/b alpine:3.20 sh -c 'rm -rf /b/* /b/.[!.]* 2>/dev/null' >/dev/null 2>&1
  rm -rf "$BAC" 2>/dev/null
}
trap nettoyer EXIT

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  printf '\033[31m✖ Le port %s est déjà pris.\033[0m Relancez avec CORS_PORT=<libre>.\n' "$PORT" >&2
  exit 2
fi

# Le Caddyfile RÉEL. Seule retouche : certificats locaux au lieu d'ACME — le
# routage, les matchers et les en-têtes restent EXACTEMENT ceux du dépôt.
mkdir -p "$BAC/data"
sed 's/^{\$STORAGE_DOMAIN} {/{$STORAGE_DOMAIN} {\n\ttls internal/' \
  "$RACINE/docker/Caddyfile" > "$BAC/Caddyfile"
cp "$BAC/Caddyfile" "$BAC/Caddyfile.bon"

cat > "$BAC/amont.py" << 'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
def mk(port):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            c = ("PORT=%d HOST=%s" % (port, self.headers.get("Host", "?"))).encode()
            self.send_response(200); self.send_header("Content-Length", str(len(c)))
            self.end_headers(); self.wfile.write(c)
        def do_OPTIONS(self):
            self.send_response(200); self.send_header("X-Amont-Options", "oui")
            self.send_header("Content-Length", "0"); self.end_headers()
        def log_message(self, *a): pass
    return HTTPServer(("0.0.0.0", port), H)
Thread(target=mk(3902).serve_forever, daemon=True).start()
mk(3900).serve_forever()
PY

monter() {
  docker rm -f "$PROJET-caddy" >/dev/null 2>&1
  docker run -d --name "$PROJET-caddy" --network "$PROJET-net" -p "$PORT":443 \
    -e ACME_EMAIL=epreuve@exemple.test -e PUBLIC_DOMAIN=gafeso.test \
    -e API_DOMAIN=api.gafeso.test -e STORAGE_DOMAIN=storage.gafeso.test \
    -v "$BAC/Caddyfile":/etc/caddy/Caddyfile:ro -v "$BAC/data":/data caddy:2 >/dev/null
  for _ in $(seq 1 30); do
    curl -sS -k --resolve "storage.gafeso.test:$PORT:127.0.0.1" \
      -o /dev/null "https://storage.gafeso.test:$PORT/x" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

docker network create "$PROJET-net" >/dev/null 2>&1
docker rm -f "$PROJET-amont" >/dev/null 2>&1
docker run -d --name "$PROJET-amont" --network "$PROJET-net" --network-alias garage \
  -v "$BAC/amont.py":/a.py:ro python:3.12-alpine python /a.py >/dev/null
monter || { printf '\033[31m✖ Caddy n’a pas démarré.\033[0m\n' >&2; docker logs "$PROJET-caddy" 2>&1 | tail -20 >&2; exit 1; }

U="https://storage.gafeso.test:$PORT/digital-copies/a/doc.pdf?X-Amz-Signature=x"
R=(--resolve "storage.gafeso.test:$PORT:127.0.0.1")
acao() { curl -sS -k "${R[@]}" -D- -o /dev/null ${1:+-H "Origin: $1"} "$U" 2>/dev/null \
  | grep -i '^access-control-allow-origin:' | head -1 | cut -d: -f2- | tr -d ' \r'; }

printf '\n\033[1m── Origines de TENANT : l’en-tête est posé, et REFLÉTÉ ──\033[0m\n'
for o in https://gafeso.test https://bib.gafeso.test https://horizon.gafeso.test; do
  V=$(acao "$o")
  [ "$V" = "$o" ] && ok "$o → reflété" || ko "$o → attendu « $o », obtenu « ${V:-aucun} »"
done

printf '\n\033[1m── Origines ÉTRANGÈRES : AUCUN en-tête (ni *, ni repli) ──\033[0m\n'
# ⚠ Les trois dernières sont la confusion PLAUSIBLE : un test de suffixe SANS
# le point les accepterait, et c'est la forme exacte d'un hameçonnage.
for o in https://evil.exemple https://gafeso.test.evil.tk http://gafeso.test \
         https://evil-gafeso.test https://notgafeso.test https://xgafeso.test; do
  V=$(acao "$o")
  [ -z "$V" ] && ok "$o → aucun en-tête" || ko "$o → en-tête POSÉ (« $V ») : faille"
done
V=$(acao ""); [ -z "$V" ] && ok "sans Origin (client non navigateur) → aucun en-tête" \
  || ko "sans Origin → en-tête posé (« $V »)"

printf '\n\033[1m── Ce que l’ajout ne doit PAS casser ──\033[0m\n'
CORPS=$(curl -sS -k "${R[@]}" -o- -H "Origin: https://gafeso.test" "$U" 2>/dev/null)
case "$CORPS" in
  *"HOST=garage:3900"*) ok "forçage SigV4 du Host intact (garage:3900)" ;;
  *) ko "le Host transmis à Garage a changé : « $CORPS » — la signature sera refusée" ;;
esac
PRE=$(curl -sS -k "${R[@]}" -D- -o /dev/null -X OPTIONS -H "Origin: https://gafeso.test" \
  -H "Access-Control-Request-Method: GET" "$U" 2>/dev/null)
printf '%s' "$PRE" | grep -q "204" && ok "prévol OPTIONS → 204" || ko "prévol OPTIONS n’est pas 204"
printf '%s' "$PRE" | grep -qi "x-amont-options" \
  && ko "le prévol a été TRANSMIS à Garage (la signature ne couvre pas OPTIONS)" \
  || ok "prévol traité par Caddy, jamais transmis à Garage"
printf '%s' "$PRE" | grep -qi "^vary: *origin" \
  && ok "Vary: Origin posé (l’en-tête dépend de la requête)" \
  || ko "Vary: Origin MANQUE — un cache servirait l’en-tête d’une autre école"
CV=$(curl -sS -k "${R[@]}" -D- -o- -H "Origin: https://gafeso.test" \
  "https://storage.gafeso.test:$PORT/une-couverture.webp" 2>/dev/null)
case "$CV" in
  *"PORT=3902"*) ok "branche couvertures intacte (point d’entrée web 3902)" ;;
  *) ko "les couvertures ne passent plus par 3902" ;;
esac

printf '\n\033[1m── 🔴 CONTRÔLE NÉGATIF — la CONDITION porte-t-elle la propriété ? ──\033[0m\n'
python3 - "$BAC/Caddyfile" << 'PY'
import sys
p = sys.argv[1]; s = open(p).read()
a = s.replace("\t\theader @origine_tenant {", "\t\theader {", 1)
assert a != s, "motif @origine_tenant introuvable"
b = a.replace("\t\t@origine_sous_domaine header Origin *.{$PUBLIC_DOMAIN}",
              "\t\t@jamais header Origin zzz-aucune-correspondance", 1)
assert b != a, "motif @origine_sous_domaine introuvable"
c = b.replace("\t\theader @origine_sous_domaine {", "\t\theader @jamais {", 1)
assert c != b
open(p, "w").write(c)
PY
monter || { ko "Caddy n’a pas redémarré avec la mutation"; }
V=$(acao "https://evil.exemple")
[ -n "$V" ] \
  && ok "condition retirée → l’origine étrangère reçoit « $V » : la condition portait bien la propriété" \
  || ko "condition retirée et l’origine étrangère ne reçoit TOUJOURS rien — cette épreuve ne mesure pas ce qu’elle annonce"
cp "$BAC/Caddyfile.bon" "$BAC/Caddyfile"; monter >/dev/null 2>&1
V=$(acao "https://evil.exemple")
[ -z "$V" ] && ok "restauré : l’origine étrangère ne reçoit plus rien" \
  || ko "restauration incomplète (« $V » encore posé)"

printf '\n\033[1m%d réussies, %d échouées\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
