#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════
# Gafeso — installateur une-commande.
#
# D'un VPS nu à un Gafeso en ligne en ~15 minutes : vérifie les prérequis,
# pose quelques questions (avec des défauts sensés), GÉNÈRE tous les secrets,
# construit et lance la pile de production, applique les migrations, et
# provisionne le premier établissement.
#
#   ./install.sh                      # interactif
#   ./install.sh --config install.conf  # non-interactif (voir install.conf.example)
#   ./install.sh --force              # ré-écrase un .env.prod existant
#   ./install.sh --skip-dns-check     # poursuivre malgré un DNS non conforme
#   ./install.sh --install-docker     # autoriser l'installation de Docker sans question
#   ./install.sh --help
#
# Docker absent ? Le script propose de l'installer via le script officiel
# (https://get.docker.com) : les dépôts Ubuntu/Debian ne fournissent PAS le
# plugin Compose v2, et `docker.io` livre un moteur sans Compose v2.
#
# PRÉREQUIS DNS (mode domaine) : trois enregistrements A doivent pointer vers
# ce serveur AVANT l'installation — <domaine>, api.<domaine>, storage.<domaine>.
# Le script les rappelle en tête et les vérifie avant de démarrer Caddy : sans
# eux, Let's Encrypt ne peut pas délivrer les certificats.
#
# L'utilisateur ne choisit AUCUN secret : Postgres, JWT, MinIO, clé API admin
# et mot de passe super-admin sont tirés au hasard, forts, et affichés UNE
# fois. Idempotent : refuse d'écraser une installation existante sans --force.
# ═════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Affichage ────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'
  BLU=$'\e[34m'; CYN=$'\e[36m'; RST=$'\e[0m'
else
  BOLD=''; DIM=''; RED=''; GRN=''; YLW=''; BLU=''; CYN=''; RST=''
fi
info()  { printf '%s→%s %s\n' "$BLU" "$RST" "$*"; }
ok()    { printf '%s✔%s %s\n' "$GRN" "$RST" "$*"; }
warn()  { printf '%s⚠%s %s\n' "$YLW" "$RST" "$*"; }
step()  { printf '\n%s%s%s\n' "$BOLD$CYN" "$*" "$RST"; }
die()   { printf '\n%s✖ %s%s\n' "$RED$BOLD" "$*" "$RST" >&2; exit 1; }

# ── État global ──────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"
COMPOSE_FILE="docker/docker-compose.prod.yml"
ENV_FILE=".env.prod"

# slugify() / slug_is_valid() — dérivation de l'identifiant d'établissement.
# Testées par scripts/lib/slugify.test.sh.
# shellcheck source=scripts/lib/slugify.sh
. "$REPO_ROOT/scripts/lib/slugify.sh"

FORCE=0
NONINTERACTIVE=0
CONFIG_FILE=""
PROJECT=""                 # nom de projet Compose (isolation) ; défaut = celui du fichier
DO_BUILD=1
API_URL_HINT=""            # URL API joignable (schéma + port) pour les exemples du récap
SERVER_IP=""               # IP publique détectée (announce_dns)
SKIP_DNS_CHECK="${SKIP_DNS_CHECK:-}"   # 1 = passer outre un DNS non conforme
INSTALL_DOCKER="${INSTALL_DOCKER:-}"   # 1 = autoriser l'install auto de Docker en non-interactif

# Réponses (remplies par les questions ou le fichier de config)
MODE=""                    # "domain" | "localhost"
DOMAIN=""                  # domaine principal saisi (ou "localhost")
ADMIN_EMAIL=""
SEARCH_ENGINE="meilisearch"
ELASTIC_NODE=""
SMTP_HOST=""; SMTP_PORT="587"; SMTP_SECURE=""; SMTP_USER=""; SMTP_PASS=""   # SECURE vide = déduit du port
MAIL_FROM_ADDR=""          # expéditeur : domaine du COMPTE SMTP, pas de l'installation
LIBRARY_ADMIN_EMAIL=""     # boîte réelle de l'administrateur de la bibliothèque
SCHOOL_NAME=""; SCHOOL_SLUG=""; SCHOOL_COLOR="#1E5E3A"
HTTP_PORT="80"; HTTPS_PORT="443"

# Ressources conseillées (Mo)
MIN_RAM_MEILI=1500
MIN_RAM_ES=3500
MIN_DISK=5000

# ── Nettoyage sur erreur ─────────────────────────────────────────────────
CLEANUP_HINT=""
on_exit() {
  local code=$?
  if [ "$code" -ne 0 ] && [ -n "$CLEANUP_HINT" ]; then
    printf '\n%s%s%s\n' "$YLW" "$CLEANUP_HINT" "$RST" >&2
  fi
}
trap on_exit EXIT

usage() {
  # Tout l'en-tête, jusqu'à la seconde ligne de séparation — pas une plage de
  # lignes figée, qui tronquait l'aide dès que l'en-tête s'allongeait.
  sed -n '2,/^# ═\{10,\}$/p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# ── Arguments ────────────────────────────────────────────────────────────
parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --force) FORCE=1 ;;
      --config) CONFIG_FILE="${2:?--config exige un fichier}"; NONINTERACTIVE=1; shift ;;
      --project) PROJECT="${2:?--project exige un nom}"; shift ;;
      --http-port) HTTP_PORT="${2:?}"; shift ;;
      --https-port) HTTPS_PORT="${2:?}"; shift ;;
      --no-build) DO_BUILD=0 ;;
      --skip-dns-check) SKIP_DNS_CHECK=1 ;;
      --install-docker) INSTALL_DOCKER=1 ;;
      -h|--help) usage ;;
      *) die "Argument inconnu : $1 (voir --help)" ;;
    esac
    shift
  done
}

# ── Invocation Docker Compose (avec projet optionnel) ────────────────────
dc() {
  if [ -n "$PROJECT" ]; then
    docker compose --env-file "$ENV_FILE" -p "$PROJECT" -f "$COMPOSE_FILE" "$@"
  else
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  fi
}

# ── Questions ────────────────────────────────────────────────────────────
ask() { # ask VAR "question" "defaut"
  local __var="$1" __q="$2" __def="${3:-}" __ans
  if [ "$NONINTERACTIVE" = 1 ]; then
    printf -v "$__var" '%s' "${!__var:-$__def}"; return
  fi
  if [ -n "$__def" ]; then
    read -r -p "$(printf '%s%s%s [%s] : ' "$BOLD" "$__q" "$RST" "$__def")" __ans || true
    printf -v "$__var" '%s' "${__ans:-$__def}"
  else
    read -r -p "$(printf '%s%s%s : ' "$BOLD" "$__q" "$RST")" __ans || true
    printf -v "$__var" '%s' "$__ans"
  fi
}
confirm() { # confirm "question" (défaut non)
  [ "$NONINTERACTIVE" = 1 ] && return 1
  local a; read -r -p "$(printf '%s%s%s [o/N] : ' "$BOLD" "$1" "$RST")" a || true
  [[ "$a" =~ ^[oOyY]$ ]]
}

# ── Génération de secrets (URL-safe : [A-Za-z0-9_-], sûrs dans .env/URL) ──
gen_secret() { openssl rand -base64 "${1:-32}" | tr -d '\n=' | tr '+/' '-_'; }

# ── Clés du cœur offline (module offline-licensing) ──────────────────────
# Format IMPOSÉ par OfflineKeysService (apps/api/src/offline-licensing) :
#  · OFFLINE_CONTENT_KEK : base64 STANDARD de 32 octets exactement. On n'utilise
#    donc PAS gen_secret() (qui retire le padding et remplace +/ par -_ : la
#    valeur ne se redécoderait pas en 32 octets).
#  · OFFLINE_LICENSE_PRIVATE_KEY : PEM PKCS8 Ed25519. Un fichier d'environnement
#    ne gère pas les valeurs multilignes → on écrit le PEM sur UNE ligne avec les
#    retours échappés « \n » ; le service les reconvertit (skPem.replace(/\\n/g)).
gen_content_kek() { openssl rand -base64 32 | tr -d '\n'; }
gen_license_key() { openssl genpkey -algorithm ed25519 | awk 'BEGIN{ORS="\\n"}1'; }

# Relit une valeur déjà présente dans un .env.prod existant (mode --force) :
# ces deux clés sont liées aux DONNÉES (contenus chiffrés, licences déjà émises)
# et ne doivent jamais être régénérées silencieusement.
read_env_value() { # read_env_value CLÉ
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1
}

# ── Prérequis ────────────────────────────────────────────────────────────
apt_offer() { # apt_offer "paquet-apt" "commande"
  local pkg="$1" cmd="$2"
  warn "$cmd introuvable."
  if command -v apt-get >/dev/null 2>&1 && confirm "Installer $pkg via apt maintenant ?"; then
    sudo apt-get update -qq && sudo apt-get install -y "$pkg" || die "Échec de l'installation de $pkg."
  else
    die "$cmd est requis. Installez-le puis relancez (voir docs/INSTALLATION.md § Diagnostic)."
  fi
}

# Installation de Docker par le script officiel (get.docker.com).
#
# On n'utilise PAS apt pour Docker : sur une Ubuntu/Debian vierge, le paquet
# `docker-compose-plugin` n'existe pas dans les dépôts de la distribution (il
# vit dans le dépôt Docker), et `docker.io` livre un moteur sans Compose v2 —
# l'installation échouait donc systématiquement sur une machine neuve. Le
# script officiel ajoute le dépôt Docker et installe moteur + plugin Compose
# d'un seul tenant.
install_docker_official() {
  warn "Docker (ou le plugin Compose v2) est absent."
  info "Le paquet 'docker-compose-plugin' n'est pas fourni par Ubuntu/Debian : il faut le dépôt officiel Docker."
  if [ "$NONINTERACTIVE" = 1 ] && [ "$INSTALL_DOCKER" != "1" ]; then
    die "Docker est requis. Installez-le (https://get.docker.com) puis relancez, ou passez INSTALL_DOCKER=1 dans le fichier de configuration."
  fi
  if [ "$NONINTERACTIVE" != 1 ] && [ "$INSTALL_DOCKER" != "1" ] \
     && ! confirm "Installer Docker maintenant via le script officiel (https://get.docker.com) ?"; then
    die "Docker est requis. Voir https://docs.docker.com/engine/install/ puis relancez."
  fi

  info "Téléchargement et exécution du script officiel Docker…"
  local tmp="${TMPDIR:-/tmp}/gafeso-get-docker.sh"
  curl -fsSL https://get.docker.com -o "$tmp" || die "Téléchargement de get.docker.com impossible (réseau ?)."
  sudo sh "$tmp" || die "L'installation de Docker a échoué (voir la sortie ci-dessus)."
  rm -f "$tmp"

  # Le démon démarre en arrière-plan : ne pas enchaîner immédiatement.
  wait_for_docker_daemon
}

# Attend que le démon réponde réellement. `docker ps` (et non `docker info`)
# est le bon test : il échoue AUSSI quand le socket existe mais que l'appelant
# n'a pas les droits — exactement le cas juste après une première installation.
wait_for_docker_daemon() {
  info "Attente du démon Docker…"
  local waited=0
  while [ "$waited" -lt 60 ]; do
    if docker ps >/dev/null 2>&1; then
      printf '\n'
      ok "Le démon Docker répond."
      return 0
    fi
    # Socket joignable mais droits refusés : l'utilisateur n'est pas encore
    # dans le groupe docker. L'ajout ne prend effet qu'à la prochaine session.
    if docker ps 2>&1 | grep -qi "permission denied"; then
      printf '\n'
      warn "Le démon tourne mais votre compte n'a pas le droit de lui parler."
      if [ "$NONINTERACTIVE" != 1 ] && confirm "Ajouter $USER au groupe 'docker' ?"; then
        sudo usermod -aG docker "$USER" || true
      fi
      die "Ajoutez votre compte au groupe docker puis OUVREZ UNE NOUVELLE SESSION (déconnexion/reconnexion, ou 'newgrp docker'), et relancez ./install.sh."
    fi
    sudo systemctl start docker >/dev/null 2>&1 || true
    sleep 3
    waited=$((waited + 3))
    printf '\r  %s… %ss%s ' "$DIM" "$waited" "$RST"
  done
  printf '\n'
  die "Le démon Docker ne répond toujours pas après 60 s (essayez 'sudo systemctl start docker')."
}

check_prereqs() {
  step "1/6 · Vérification des prérequis"
  command -v git >/dev/null 2>&1 || apt_offer git git
  command -v openssl >/dev/null 2>&1 || apt_offer openssl openssl
  command -v curl >/dev/null 2>&1 || apt_offer curl curl
  # Moteur ET plugin Compose v2 : les deux viennent du script officiel.
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    install_docker_official
  fi
  docker ps >/dev/null 2>&1 || wait_for_docker_daemon
  ok "Docker + Compose + git présents."

  # RAM / disque (conseil, pas blocage dur sauf disque)
  local ram_mb disk_mb need_ram
  ram_mb=$(free -m 2>/dev/null | awk '/Mem:/{print $2}')
  disk_mb=$(df -m "$REPO_ROOT" | awk 'NR==2{print $4}')
  need_ram=$MIN_RAM_MEILI
  [ "$SEARCH_ENGINE" = "elasticsearch" ] && need_ram=$MIN_RAM_ES
  if [ -n "$ram_mb" ] && [ "$ram_mb" -lt "$need_ram" ]; then
    warn "RAM détectée ${ram_mb} Mo (conseillé ≥ ${need_ram} Mo). L'installation peut être instable."
    confirm "Continuer quand même ?" || die "Arrêt : RAM insuffisante."
  fi
  [ -n "$disk_mb" ] && [ "$disk_mb" -lt "$MIN_DISK" ] && die "Disque libre ${disk_mb} Mo < ${MIN_DISK} Mo requis."
  ok "Ressources : RAM ${ram_mb:-?} Mo, disque libre ${disk_mb:-?} Mo."
}

# ── Dérivations SMTP ─────────────────────────────────────────────────────
# TLS implicite (465) ou STARTTLS (587/25) ? DÉDUIT DU PORT, et écrit
# EXPLICITEMENT dans .env.prod.
#
# L'API sait déjà déduire (resolveSmtpSecure) quand la variable est vide, mais
# une valeur vide n'apprend rien à qui relit son .env.prod pour comprendre
# pourquoi les mails ne partent pas. Écrire `false` en toutes lettres rend le
# choix lisible et vérifiable.
#
# Cas vécu : l'installation avait écrit `true` sur le port 587. Le serveur
# répondait `535 Incorrect authentication data` — alors que les identifiants
# étaient bons, ce qu'un test SMTP direct a confirmé. Le message d'erreur
# accusait les identifiants ; la cause était le mode TLS.
smtp_secure_for_port() {
  case "${1:-587}" in
    465) printf 'true' ;;
    *)   printf 'false' ;;
  esac
}

# Expéditeur par défaut, déduit du compte SMTP. Si l'utilisateur SMTP est une
# adresse email, on reprend SON domaine. Beaucoup de fournisseurs (Brevo,
# Mailjet…) donnent en revanche un identifiant technique qui n'est pas une
# adresse : dans ce cas on ne devine pas, on laisse vide et l'opérateur saisit.
smtp_sender_default() {
  case "${SMTP_USER:-}" in
    *@*.*) printf 'no-reply@%s' "${SMTP_USER##*@}" ;;
    *)     printf '' ;;
  esac
}

# ── Test SMTP (AVERTIT, ne bloque JAMAIS) ────────────────────────────────
# Volontairement NON bloquant, à l'inverse du garde-fou des clés offline :
# sans ces clés le cœur du produit ne fonctionne pas, donc refuser de démarrer
# est juste. Ici, Gafeso fonctionne parfaitement sans messagerie — c'est
# seulement moins pratique (le lien d'activation se récupère dans l'interface,
# écran Comptes → « Lien d'activation »). Un client sans serveur mail doit
# pouvoir installer.
#
# Ce que le test attrape : le cas vécu du certificat qui ne couvre pas le
# domaine. Le port répond (c'est l'hébergement web), mais la poignée de main
# TLS échoue et aucun mail ne part — alors que tout paraît configuré.
check_smtp() {
  [ -n "${SMTP_HOST:-}" ] || return 0
  local port="${SMTP_PORT:-587}"
  info "Test de la connexion SMTP vers ${SMTP_HOST}:${port}…"

  # 1) Le port répond-il ?
  if ! timeout 8 bash -c "</dev/tcp/${SMTP_HOST}/${port}" 2>/dev/null; then
    warn "Aucune réponse sur ${SMTP_HOST}:${port} (hôte, port ou pare-feu)."
    info "L'installation CONTINUE : les emails seront journalisés, pas envoyés."
    info "Le lien d'activation reste récupérable dans Comptes → « Lien d'activation »."
    return 0
  fi
  ok "Le port ${port} répond."

  # 2) La poignée de main TLS aboutit-elle, et le certificat couvre-t-il l'hôte ?
  if ! command -v openssl >/dev/null 2>&1; then
    info "openssl absent : contrôle du certificat ignoré."
    return 0
  fi
  local out mode
  if [ "$port" = "465" ]; then mode=(-connect "${SMTP_HOST}:${port}")
  else mode=(-starttls smtp -connect "${SMTP_HOST}:${port}"); fi
  out="$(printf 'QUIT\r\n' | timeout 15 openssl s_client "${mode[@]}" \
        -servername "${SMTP_HOST}" -verify_hostname "${SMTP_HOST}" 2>&1 || true)"

  if printf '%s' "$out" | grep -q "Verification: OK"; then
    ok "Poignée de main TLS réussie, certificat valide pour ${SMTP_HOST}."
  elif printf '%s' "$out" | grep -qiE "Hostname mismatch|verify error|self.signed|unable to verify"; then
    warn "Le certificat TLS ne couvre PAS ${SMTP_HOST} (ou n'est pas vérifiable)."
    info "C'est le cas typique d'un domaine d'école pointé vers son hébergement web :"
    info "le port répond, mais aucun mail ne partira. Utilisez l'hôte du FOURNISSEUR"
    info "(visible dans le MX : dig +short MX ${DOMAIN:-votre-domaine})."
    info "L'installation CONTINUE — la messagerie sera simplement inactive."
  else
    warn "Poignée de main TLS non concluante (serveur exotique ou délai dépassé)."
    info "L'installation CONTINUE. Vérifiez l'envoi d'un email après la mise en service."
  fi

  smtp_send_probe "$port"
  return 0
}

# 3) ENVOI RÉEL — le seul contrôle qui prouve quelque chose.
#
# POURQUOI ALLER JUSQU'À L'ENVOI. Les étapes 1 et 2 valident le transport ; elles
# ne valident NI les identifiants NI le droit d'expédier sous l'adresse choisie.
# Or les deux pannes vécues se situent exactement là :
#   · mode TLS erroné → `535 Incorrect authentication data`, un message qui
#     accuse les identifiants alors qu'ils sont bons ;
#   · expéditeur hors du domaine du compte → le serveur authentifie, accepte,
#     puis ne délivre rien, pendant que le journal applicatif dit « Email
#     envoyé ».
# Aucune de ces deux pannes n'est visible avant qu'un message ait réellement
# tenté de partir. Un test qui s'arrête à l'authentification les manque toutes
# les deux — et rend « vert ».
#
# NE BLOQUE JAMAIS. Gafeso fonctionne sans messagerie : le lien d'activation se
# récupère dans Comptes → « Lien d'activation ». Un client sans serveur mail
# doit pouvoir installer. On avertit, on diagnostique, on continue.
smtp_send_probe() {
  local port="${1:-587}"
  local dest="${LIBRARY_ADMIN_EMAIL:-$ADMIN_EMAIL}"
  local from="${MAIL_FROM_ADDR:-}"

  if [ -z "$from" ] || [ -z "$dest" ]; then
    info "Envoi de test ignoré (expéditeur ou destinataire non renseigné)."
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1 || ! curl --version | grep -q "smtp"; then
    info "curl sans support SMTP : envoi de test ignoré."
    info "Vérifiez vous-même l'arrivée d'un email après la mise en service."
    return 0
  fi

  info "Envoi d'un email de test à ${dest}…"

  # TLS EXIGÉ DÈS QU'IL Y A UN MOT DE PASSE À PROTÉGER. Sans identifiants, on
  # tolère le clair : un relais local sans authentification (postfix sur la
  # machine, passerelle interne) est une configuration légitime et fréquente en
  # déploiement souverain, et l'exiger ferait échouer un test qui aurait dû
  # passer. Avec identifiants, en revanche, jamais : un test qui « réussit » en
  # envoyant le mot de passe en clair vaut moins que pas de test du tout.
  local scheme="smtp" opts=()
  if [ "$(smtp_secure_for_port "$port")" = "true" ]; then
    scheme="smtps"
  elif [ -n "${SMTP_PASS:-}" ]; then
    opts=(--ssl-reqd)
  fi

  local out rc
  # --mail-rcpt donne l'enveloppe ; l'en-tête To: est cosmétique. Le mot de
  # passe passe par --user : il n'apparaît ni dans la sortie ni dans les logs.
  out="$(printf 'From: Gafeso <%s>\r\nTo: <%s>\r\nSubject: Gafeso — test de messagerie\r\n\r\nCe message confirme que Gafeso peut envoyer des emails depuis cette installation.\r\nAucune action requise.\r\n' \
        "$from" "$dest" \
    | timeout 30 curl --silent --show-error "${opts[@]}" \
        --url "${scheme}://${SMTP_HOST}:${port}" \
        --user "${SMTP_USER}:${SMTP_PASS}" \
        --mail-from "$from" --mail-rcpt "$dest" \
        --upload-file - 2>&1)"; rc=$?

  if [ $rc -eq 0 ]; then
    ok "Email de test accepté par ${SMTP_HOST} (expéditeur ${from})."
    info "Vérifiez sa réception sur ${dest} — s'il n'arrive pas, regardez les"
    info "indésirables, puis les enregistrements SPF/DKIM du domaine ${from##*@}."
    return 0
  fi

  warn "L'envoi de test a ÉCHOUÉ. La messagerie sera inactive."
  # Diagnostic ciblé : on nomme la cause probable au lieu de recopier l'erreur.
  case "$out" in
    *535*|*"authentication"*|*"Authentication"*)
      warn "  Le serveur a refusé l'authentification."
      info "  Vérifiez l'utilisateur et le mot de passe — mais AUSSI le mode TLS :"
      info "  sur le port ${port}, Gafeso utilisera SMTP_SECURE=$(smtp_secure_for_port "$port")."
      info "  Un mode TLS erroné produit la même erreur 535 que de mauvais identifiants."
      ;;
    *"550"*|*"553"*|*"not allowed"*|*"Sender"*|*"sender"*)
      warn "  Le serveur a refusé l'EXPÉDITEUR ${from}."
      info "  Cette adresse doit appartenir au domaine du compte SMTP (${SMTP_USER##*@})."
      info "  C'est la panne la plus discrète : sans ce test, l'application aurait"
      info "  journalisé « Email envoyé » sans que rien ne parte."
      ;;
    *"STARTTLS not supported"*|*"SSL"*|*"TLS"*)
      warn "  Le serveur n'offre PAS de chiffrement sur le port ${port}."
      info "  Le test s'est ARRÊTÉ VOLONTAIREMENT : il y a un mot de passe SMTP à"
      info "  protéger, et l'envoyer en clair sur le réseau serait pire que ne pas"
      info "  tester. Ce n'est pas une panne de Gafeso."
      info "  Vérifiez le port (587 STARTTLS, 465 TLS implicite) auprès du fournisseur."
      ;;
    *timeout*|*"Timeout"*|*"connect"*|*"Connection"*|*"Could not resolve"*)
      warn "  Connexion interrompue (pare-feu, ou port sortant bloqué par l'hébergeur)."
      ;;
    *)
      warn "  Cause non identifiée. Réponse du serveur :"
      printf '  %s%s%s\n' "$DIM" "$(printf '%s' "$out" | tail -3)" "$RST"
      ;;
  esac
  info "L'installation CONTINUE — le lien d'activation reste récupérable dans"
  info "Comptes → « Lien d'activation »."
  return 0
}

# ── Collecte des réponses ────────────────────────────────────────────────
load_config() {
  [ -f "$CONFIG_FILE" ] || die "Fichier de configuration introuvable : $CONFIG_FILE"
  # Analyse KEY=VALUE (PAS un `source` shell) : les valeurs peuvent contenir
  # des espaces sans guillemets (ex. SCHOOL_NAME=Ma Bibliothèque).
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    val="${val#\"}"; val="${val%\"}" # guillemets encadrants optionnels
    printf -v "$key" '%s' "$val"
  done < "$CONFIG_FILE"
  info "Configuration chargée depuis $CONFIG_FILE (mode non-interactif)."
}

collect_answers() {
  step "2/6 · Configuration"

  # Domaine ou localhost
  ask DOMAIN "Domaine principal (ou 'localhost' pour un essai local)" "${DOMAIN:-localhost}"
  if [ "$DOMAIN" = "localhost" ] || [[ "$DOMAIN" == localhost:* ]]; then
    MODE="localhost"
    DOMAIN="localhost"
  else
    MODE="domain"
    [[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || die "Domaine invalide : $DOMAIN"
  fi

  # Email admin (Let's Encrypt + super-admin)
  ask ADMIN_EMAIL "Email de l'administrateur (Let's Encrypt + compte super-admin)" "${ADMIN_EMAIL:-}"
  [[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Email invalide : ${ADMIN_EMAIL:-<vide>}"

  # Moteur de recherche
  if [ "$NONINTERACTIVE" != 1 ]; then
    printf '%sMoteur de recherche%s : %smeilisearch%s (recommandé, ~100 Mo) | elasticsearch (2–4 Go de RAM, infra existante)\n' \
      "$BOLD" "$RST" "$GRN" "$RST"
  fi
  ask SEARCH_ENGINE "  → moteur" "${SEARCH_ENGINE:-meilisearch}"
  case "$SEARCH_ENGINE" in
    meilisearch) ;;
    elasticsearch)
      warn "Elasticsearch exige 2–4 Go de RAM (voir docs/search-engines.md). Il n'est PAS géré par cet installateur : fournissez un cluster ES existant."
      ask ELASTIC_NODE "  → URL du nœud Elasticsearch existant" "${ELASTIC_NODE:-http://localhost:9200}"
      ;;
    *) die "Moteur inconnu : $SEARCH_ENGINE (meilisearch | elasticsearch)" ;;
  esac

  # SMTP (optionnel — 'plus tard' est un choix valide)
  if [ "$NONINTERACTIVE" = 1 ]; then
    # Valeurs déjà éventuellement dans le fichier de config. Mais on applique
    # QUAND MÊME la dérivation d'expéditeur et le test d'envoi : le mode
    # non-interactif est le chemin d'une VRAIE mise en production, pas un
    # raccourci de développement. L'en dispenser reviendrait à réserver les
    # garde-fous aux installations manuelles — c'est-à-dire à celles qui en ont
    # le moins besoin.
    if [ -n "${SMTP_HOST:-}" ]; then
      [ -n "${MAIL_FROM_ADDR:-}" ] || MAIL_FROM_ADDR="$(smtp_sender_default)"
      if [ -z "${MAIL_FROM_ADDR:-}" ]; then
        warn "MAIL_FROM_ADDR n'est pas renseigné et SMTP_USER n'est pas une adresse email."
        info "L'expéditeur retombera sur no-reply@${DOMAIN} — ce qui échoue si ce"
        info "domaine n'est pas celui du compte SMTP. Renseignez MAIL_FROM_ADDR."
      fi
      check_smtp
    fi
  elif confirm "Configurer le SMTP maintenant ? (sinon : plus tard — les emails seront désactivés proprement)"; then
    # L'hôte du FOURNISSEUR, pas le domaine de l'école. C'est la confusion la
    # plus coûteuse : « ecole.bf » répond bien sur 587 (c'est l'hébergement web)
    # mais son certificat ne couvre pas ce service — la poignée de main TLS
    # échoue et AUCUN mail ne part, alors que tout paraît configuré.
    printf '  %sL'\''hôte de votre FOURNISSEUR de messagerie%s, pas votre domaine.\n' "$BOLD" "$RST"
    printf '  %sIl est lisible dans l'\''enregistrement MX du domaine :%s\n' "$DIM" "$RST"
    printf '  %s    dig +short MX %s%s\n' "$DIM" "${DOMAIN:-votre-domaine}" "$RST"
    printf '  %sExemples : smtp.gmail.com · smtp-relay.brevo.com · mail.infomaniak.com%s\n' "$DIM" "$RST"
    ask SMTP_HOST "  → hôte SMTP du fournisseur" "${SMTP_HOST:-}"
    ask SMTP_PORT "  → port SMTP (587 STARTTLS, 465 TLS implicite)" "${SMTP_PORT:-587}"
    ask SMTP_USER "  → utilisateur SMTP" "${SMTP_USER:-}"
    ask SMTP_PASS "  → mot de passe SMTP" "${SMTP_PASS:-}"

    # Adresse d'expédition : elle doit appartenir au DOMAINE DU COMPTE SMTP, pas
    # au domaine de l'installation. Cas vécu : compte `no-reply@gafeso.org`,
    # installation sur `demo.gafeso.org` → l'expéditeur écrit était
    # `no-reply@demo.gafeso.org`. Le serveur authentifie, ACCEPTE la connexion,
    # puis refuse ou jette le message parce que l'expéditeur ne lui appartient
    # pas — et le journal applicatif affiche « Email envoyé ». Rien n'arrive,
    # rien ne le dit.
    ask MAIL_FROM_ADDR "  → adresse d'expédition (doit appartenir au compte SMTP)" \
      "${MAIL_FROM_ADDR:-$(smtp_sender_default)}"

    check_smtp
  else
    info "SMTP ignoré : les emails seront journalisés au lieu d'être envoyés (à configurer avant la mise en service)."
  fi

  # Premier établissement
  ask SCHOOL_NAME "Nom du premier établissement" "${SCHOOL_NAME:-Ma Bibliothèque}"
  # slugify() retire les accents avant de slugifier : « Ma Bibliothèque » donne
  # « ma-bibliotheque » et non « ma-biblioth-que » (voir scripts/lib/slugify.sh).
  local slug_default="${SCHOOL_SLUG:-$(slugify "$SCHOOL_NAME")}"
  ask SCHOOL_SLUG "Identifiant court (slug, minuscules)" "$slug_default"
  # Gabarit ALIGNÉ sur tenantSchemaName() côté serveur : une lettre en tête,
  # 2 à 49 caractères. L'ancien contrôle était plus permissif (chiffre initial,
  # longueur 1) et laissait passer des slugs que le provisioning refusait
  # ensuite — l'échec tombait après l'installation, au pire moment.
  slug_is_valid "$SCHOOL_SLUG" || die "Slug invalide : ${SCHOOL_SLUG:-<vide>} (une lettre minuscule en tête, puis minuscules/chiffres/tirets, 2 à 49 caractères)"
  ask SCHOOL_COLOR "Couleur principale (hex #RRGGBB)" "${SCHOOL_COLOR:-#1E5E3A}"
  [[ "$SCHOOL_COLOR" =~ ^#[0-9a-fA-F]{6}$ ]] || die "Couleur invalide : $SCHOOL_COLOR"

  # Administrateur de la bibliothèque — une BOÎTE RÉELLE, demandée, jamais
  # fabriquée.
  #
  # Le provisioning créait `admin@<domaine d'installation>`. Cette adresse
  # n'existe chez personne : elle ne reçoit ni le lien « mot de passe oublié »,
  # ni les notifications de réservation, ni les rappels. L'administrateur est
  # injoignable par son propre logiciel, et rien ne le signale — le compte
  # existe, se connecte, fonctionne. La panne n'apparaît qu'au premier mot de
  # passe perdu, c'est-à-dire quand il est trop tard pour la corriger seul.
  #
  # Par défaut on propose l'email déjà saisi plus haut : sur une installation
  # mono-établissement c'est la même personne. Les deux restent distincts pour
  # le cas où l'exploitant du serveur n'est pas le bibliothécaire.
  if [ "$NONINTERACTIVE" != 1 ]; then
    printf '  %sCette adresse recevra le lien de mot de passe oublié et les notifications.%s\n' "$DIM" "$RST"
  fi
  ask LIBRARY_ADMIN_EMAIL "Email de l'administrateur de la bibliothèque" \
    "${LIBRARY_ADMIN_EMAIL:-$ADMIN_EMAIL}"
  [[ "$LIBRARY_ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] \
    || die "Email d'administrateur invalide : ${LIBRARY_ADMIN_EMAIL:-<vide>}"
}

# ── Dérivation des domaines/URLs selon le mode ───────────────────────────
derive_config() {
  local scheme host_suffix app_port_suffix
  if [ "$MODE" = "localhost" ]; then
    # HTTP simple (pas d'ACME possible sur localhost) : Caddy sert en clair.
    scheme="http"
    [ "$HTTP_PORT" != "80" ] && app_port_suffix=":$HTTP_PORT" || app_port_suffix=""
    PUBLIC_DOMAIN="http://localhost"
    API_DOMAIN="http://api.localhost"
    STORAGE_DOMAIN="http://storage.localhost"
    APP_URL="http://localhost${app_port_suffix}"
    MINIO_PUBLIC_URL="http://storage.localhost${app_port_suffix}"
    # URL de l'API réellement joignable (schéma + port), pour les exemples
    # affichés au client. API_DOMAIN sert à Caddy, pas à être collé tel quel.
    API_URL_HINT="http://api.localhost${app_port_suffix}"
  else
    scheme="https"
    PUBLIC_DOMAIN="$DOMAIN"
    API_DOMAIN="api.$DOMAIN"
    STORAGE_DOMAIN="storage.$DOMAIN"
    APP_URL="https://$DOMAIN"
    MINIO_PUBLIC_URL="https://storage.$DOMAIN"
    API_URL_HINT="https://api.$DOMAIN"
  fi
}

# ── DNS : prérequis, pas étape suivante ──────────────────────────────────
# Les trois enregistrements DOIVENT exister AVANT le démarrage de Caddy :
# sans eux, Let's Encrypt échoue à valider les domaines et le client se
# retrouve avec une pile qui tourne mais aucun certificat. Ils étaient
# jusqu'ici annoncés dans le récapitulatif FINAL — trop tard.

# IP publique du serveur, telle que la verra le résolveur DNS.
detect_public_ip() {
  local ip=""
  ip="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
  [ -n "$ip" ] || ip="$(curl -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)"
  [ -n "$ip" ] || ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  printf '%s' "$ip"
}

# Résolution d'un nom en A, avec repli si `dig` (dnsutils) n'est pas installé.
resolve_host() { # resolve_host NOM
  if command -v dig >/dev/null 2>&1; then
    dig +short +time=3 +tries=1 "$1" A | grep -E '^[0-9.]+$' | head -1
  elif command -v getent >/dev/null 2>&1; then
    getent ahostsv4 "$1" 2>/dev/null | awk '{print $1; exit}'
  else
    printf ''
  fi
}

announce_dns() {
  [ "$MODE" = "domain" ] || return 0
  SERVER_IP="$(detect_public_ip)"
  printf '\n%s══ PRÉREQUIS : enregistrements DNS ══%s\n' "$BOLD$YLW" "$RST"
  printf 'Ces trois enregistrements doivent pointer vers ce serveur %sAVANT%s de continuer.\n' "$BOLD" "$RST"
  printf 'Sans eux, Let'\''s Encrypt ne peut pas délivrer les certificats et le site restera inaccessible.\n\n'
  printf '  %-30s %-6s %s\n' "NOM" "TYPE" "VALEUR"
  printf '  %-30s %-6s %s\n' "$DOMAIN" "A" "${SERVER_IP:-<IP de ce serveur>}"
  printf '  %-30s %-6s %s\n' "api.$DOMAIN" "A" "${SERVER_IP:-<IP de ce serveur>}"
  printf '  %-30s %-6s %s\n' "storage.$DOMAIN" "A" "${SERVER_IP:-<IP de ce serveur>}"
  printf '\n%s(Un CNAME vers %s convient aussi pour api. et storage.)%s\n' "$DIM" "$DOMAIN" "$RST"
  # storage. n'est pas accessoire : l'application mobile y télécharge les
  # documents hors-ligne par URL signée. Sans lui joignable publiquement en
  # HTTPS, l'app se connecte et affiche l'étagère, mais ne télécharge rien.
  printf '%sstorage.%s est indispensable à l'\''application mobile : les documents\n' "$DIM" "$DOMAIN"
  printf 'hors-ligne y sont téléchargés. Sans lui, l'\''app se connecte mais ne\n'
  printf 'télécharge aucun document.%s\n\n' "$RST"
  [ -n "$SERVER_IP" ] || warn "IP publique non détectée automatiquement — utilisez celle de votre serveur."
}

check_dns() {
  [ "$MODE" = "domain" ] || return 0
  [ "${SKIP_DNS_CHECK:-}" = "1" ] && { warn "Vérification DNS ignorée (SKIP_DNS_CHECK=1)."; return 0; }

  step "Vérification des enregistrements DNS"
  local bad=0 name got
  for name in "$DOMAIN" "api.$DOMAIN" "storage.$DOMAIN"; do
    got="$(resolve_host "$name")"
    if [ -z "$got" ]; then
      printf '  %s✖%s %-30s ne résout pas\n' "$RED" "$RST" "$name"; bad=1
    elif [ -n "$SERVER_IP" ] && [ "$got" != "$SERVER_IP" ]; then
      printf '  %s⚠%s %-30s résout vers %s (attendu %s)\n' "$YLW" "$RST" "$name" "$got" "$SERVER_IP"; bad=1
    else
      printf '  %s✔%s %-30s → %s\n' "$GRN" "$RST" "$name" "$got"
    fi
  done

  [ "$bad" = 0 ] && { ok "Les trois enregistrements pointent vers ce serveur."; return 0; }

  printf '\n'
  warn "Un ou plusieurs enregistrements ne pointent pas (encore) vers ce serveur."
  info "La propagation DNS peut prendre de quelques minutes à quelques heures."
  info "Si vous continuez maintenant, Caddy échouera à obtenir les certificats ; il réessaiera"
  info "automatiquement une fois le DNS corrigé (aucune réinstallation nécessaire)."
  if [ "$NONINTERACTIVE" = 1 ]; then
    die "DNS non conforme. Corrigez les enregistrements puis relancez, ou passez SKIP_DNS_CHECK=1 pour continuer sciemment."
  fi
  confirm "Continuer quand même ?" || die "Arrêt : corrigez le DNS puis relancez ./install.sh."
  warn "Poursuite malgré un DNS incomplet, à votre demande."
}

# ── Écriture de .env.prod ────────────────────────────────────────────────
write_env() {
  step "3/6 · Génération des secrets et de $ENV_FILE"
  if [ -f "$ENV_FILE" ] && [ "$FORCE" != 1 ]; then
    die "$ENV_FILE existe déjà. Une installation semble présente. Utilisez --force pour l'écraser (les DONNÉES en volumes ne sont pas touchées)."
  fi
  # Secrets forts, jamais choisis par l'utilisateur.
  POSTGRES_PASSWORD="$(gen_secret 32)"
  JWT_SECRET="$(gen_secret 40)"
  ADMIN_API_KEY="$(gen_secret 32)"
  MEILI_MASTER_KEY="$(gen_secret 32)"
  MINIO_ROOT_PASSWORD="$(gen_secret 24)"

  # Clés du cœur offline : générées UNIQUEMENT si absentes (une clé fournie via
  # install.conf, ou déjà présente dans un .env.prod réécrit avec --force, est
  # conservée — la régénérer rendrait illisibles les contenus déjà chiffrés et
  # invaliderait les licences déjà émises).
  OFFLINE_CONTENT_KEK="${OFFLINE_CONTENT_KEK:-$(read_env_value OFFLINE_CONTENT_KEK)}"
  OFFLINE_LICENSE_PRIVATE_KEY="${OFFLINE_LICENSE_PRIVATE_KEY:-$(read_env_value OFFLINE_LICENSE_PRIVATE_KEY)}"
  [ -n "$OFFLINE_CONTENT_KEK" ] || OFFLINE_CONTENT_KEK="$(gen_content_kek)"
  [ -n "$OFFLINE_LICENSE_PRIVATE_KEY" ] || OFFLINE_LICENSE_PRIVATE_KEY="$(gen_license_key)"

  # Identifiants d'infrastructure. Ordre de priorité, du plus fort au plus faible :
  #   1. valeur fournie par l'environnement / install.conf ;
  #   2. valeur DÉJÀ présente dans un .env.prod existant (cas --force) ;
  #   3. défaut « gafeso » pour une installation neuve.
  #
  # Le point 2 est essentiel : ces identifiants nomment la BASE, le RÔLE
  # PostgreSQL, les CLÉS MinIO et le préfixe des VOLUMES. Les réécrire sur une
  # installation en service pointerait vers une base et des volumes qui
  # n'existent pas — service à terre, données apparemment disparues.
  local COMPOSE_PROJECT_NAME_VALUE="${COMPOSE_PROJECT_NAME:-$(read_env_value COMPOSE_PROJECT_NAME)}"
  local POSTGRES_USER_VALUE="${POSTGRES_USER:-$(read_env_value POSTGRES_USER)}"
  local POSTGRES_DB_VALUE="${POSTGRES_DB:-$(read_env_value POSTGRES_DB)}"
  local MINIO_ROOT_USER_VALUE="${MINIO_ROOT_USER:-$(read_env_value MINIO_ROOT_USER)}"
  COMPOSE_PROJECT_NAME_VALUE="${COMPOSE_PROJECT_NAME_VALUE:-gafeso-prod}"
  POSTGRES_USER_VALUE="${POSTGRES_USER_VALUE:-gafeso}"
  POSTGRES_DB_VALUE="${POSTGRES_DB_VALUE:-gafeso}"
  MINIO_ROOT_USER_VALUE="${MINIO_ROOT_USER_VALUE:-gafeso}"

  # Une réinstallation --force sur une base historique doit le DIRE : sinon
  # l'exploitant croit être passé à gafeso alors que son infra reste nommée
  # bibliocloud (c'est volontaire et sans danger, mais ça doit être visible).
  if [ "$POSTGRES_DB_VALUE" != "gafeso" ] || [ "$COMPOSE_PROJECT_NAME_VALUE" != "gafeso-prod" ]; then
    warn "Identifiants d'infrastructure conservés depuis l'installation existante :"
    warn "  projet Compose=$COMPOSE_PROJECT_NAME_VALUE, base=$POSTGRES_DB_VALUE, rôle=$POSTGRES_USER_VALUE."
    info "C'est VOULU : les renommer détacherait les volumes et la base."
    info "Pour renommer réellement : ./scripts/rename-to-gafeso.sh (arrêt de service requis)."
  fi

  # Expéditeur : l'adresse validée avec l'opérateur (domaine du COMPTE SMTP).
  # Sans SMTP configuré, la valeur n'a aucun effet — les emails sont journalisés.
  local sender="${MAIL_FROM_ADDR:-no-reply@${DOMAIN}}"
  local mail_from="Gafeso <${sender}>"
  # TLS déduit du port et écrit EXPLICITEMENT (voir smtp_secure_for_port).
  local smtp_secure="${SMTP_SECURE:-$(smtp_secure_for_port "${SMTP_PORT:-587}")}"
  umask 077
  cat > "$ENV_FILE" <<EOF
# .env.prod — généré par install.sh le $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Secrets tirés au hasard. NE PAS committer (déjà dans .gitignore).

# ── Domaines / Caddy ──
PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
API_DOMAIN=${API_DOMAIN}
STORAGE_DOMAIN=${STORAGE_DOMAIN}
ACME_EMAIL=${ADMIN_EMAIL}
HTTP_PORT=${HTTP_PORT}
HTTPS_PORT=${HTTPS_PORT}

# ── Application ──
APP_URL=${APP_URL}
CORS_ORIGINS=

# ── Nom de projet Compose ──
# Préfixe les volumes, le réseau et les images. Écrit EXPLICITEMENT ici : les
# fichiers compose gardent l'ancien défaut (bibliocloud-prod) pour qu'une
# installation antérieure démarre sans intervention. C'est cette ligne qui fait
# qu'une NOUVELLE installation s'appelle gafeso.
# NE PAS le changer sur une installation en service : les volumes existants
# seraient détachés (données invisibles). Voir scripts/rename-to-gafeso.sh.
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME_VALUE}

# ── PostgreSQL ──
POSTGRES_USER=${POSTGRES_USER_VALUE}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB_VALUE}

# ── Auth ──
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=1d
ADMIN_API_KEY=${ADMIN_API_KEY}

# ── Moteur de recherche ──
SEARCH_ENGINE=${SEARCH_ENGINE}
MEILI_MASTER_KEY=${MEILI_MASTER_KEY}
$([ "$SEARCH_ENGINE" = elasticsearch ] && echo "ELASTIC_NODE=${ELASTIC_NODE}")

# ── MinIO ──
MINIO_ROOT_USER=${MINIO_ROOT_USER_VALUE}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_PUBLIC_URL=${MINIO_PUBLIC_URL}

# ── Email (vide = emails journalisés, pas envoyés) ──
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${smtp_secure}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
MAIL_FROM=${mail_from}

# ── Cœur offline (module offline-licensing) — l'api refuse de démarrer sans ──
# KEK de contenu : 32 octets, base64 standard (enveloppe les CEK au repos).
OFFLINE_CONTENT_KEK=${OFFLINE_CONTENT_KEK}
# Clé de signature de licence Ed25519 (PEM PKCS8) sur une ligne, retours en \n.
# À SAUVEGARDER avec les données : la perdre rend les contenus chiffrés illisibles.
OFFLINE_LICENSE_PRIVATE_KEY=${OFFLINE_LICENSE_PRIVATE_KEY}
EOF
  chmod 600 "$ENV_FILE"
  ok "$ENV_FILE écrit (chmod 600, secrets générés)."
}

# ── Démarrage de la pile + attente des healthchecks ──────────────────────
compose_up() {
  step "4/6 · Construction et démarrage de la pile"
  CLEANUP_HINT="Installation interrompue. Pour repartir de zéro : dc down -v puis rm -f $ENV_FILE."
  local build_flag=""
  [ "$DO_BUILD" = 1 ] && build_flag="--build"
  info "docker compose up -d $build_flag (première fois : construction des images, plusieurs minutes)…"
  dc up -d $build_flag

  info "Attente des services (healthchecks)…"
  local services="db redis meilisearch minio api web caddy"
  local timeout=900 elapsed=0
  while :; do
    local all_ok=1 line=""
    for svc in $services; do
      local cid st
      cid="$(dc ps -q "$svc" 2>/dev/null | head -1)"
      if [ -z "$cid" ]; then st="absent"; all_ok=0
      else
        st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo '?')"
        case "$st" in healthy|running) ;; *) all_ok=0 ;; esac
      fi
      line="$line ${svc}:${st}"
    done
    printf '\r  %s%s%s ' "$DIM" "$line" "$RST"
    [ "$all_ok" = 1 ] && { printf '\n'; break; }
    [ "$elapsed" -ge "$timeout" ] && { printf '\n'; dc ps; die "Délai dépassé en attendant les services."; }
    sleep 5; elapsed=$((elapsed+5))
  done
  ok "Tous les services sont sains (migrations Prisma appliquées au démarrage de l'api)."
}

# ── Provisioning du premier établissement ────────────────────────────────
provision() {
  step "5/6 · Provisioning de « $SCHOOL_NAME »"
  local out
  out="$(dc exec -T \
    -e PROVISION_SLUG="$SCHOOL_SLUG" \
    -e PROVISION_SCHOOL_NAME="$SCHOOL_NAME" \
    -e PROVISION_PRIMARY_COLOR="$SCHOOL_COLOR" \
    -e PROVISION_SUPERADMIN_EMAIL="$ADMIN_EMAIL" \
    -e PROVISION_ADMIN_EMAIL="$LIBRARY_ADMIN_EMAIL" \
    api node scripts/provision-production.mjs 2>&1)" || { echo "$out"; die "Provisioning échoué."; }
  echo "$out" | sed 's/^/  /'
  SUPERADMIN_PW="$(echo "$out" | grep -oE 'mot de passe : .*' | head -1 | sed 's/mot de passe : //')"
  ADMIN_LINK="$(echo "$out" | grep -oE 'lien : .*' | head -1 | sed 's/lien : //')"
  ok "Établissement provisionné."
}

# ── Récapitulatif final ──────────────────────────────────────────────────
recap() {
  CLEANUP_HINT=""
  local vol_prefix="${PROJECT:-$(read_env_value COMPOSE_PROJECT_NAME)}"
  vol_prefix="${vol_prefix:-gafeso-prod}"
  printf '\n%s══════════════════════════════════════════════════════════════%s\n' "$GRN$BOLD" "$RST"
  printf '%s  ✔ Gafeso est installé.%s\n' "$GRN$BOLD" "$RST"
  printf '%s══════════════════════════════════════════════════════════════%s\n\n' "$GRN$BOLD" "$RST"

  printf '%sAccès%s\n' "$BOLD" "$RST"
  printf '  Application (vitrine + OPAC) : %s%s%s\n' "$CYN" "$APP_URL" "$RST"
  printf '  API directe                  : %s%s%s\n' "$CYN" "${API_DOMAIN}" "$RST"
  printf '  Stockage (couvertures)       : %s%s%s\n' "$CYN" "${STORAGE_DOMAIN}" "$RST"

  printf '\n%s⚠ Identifiants générés — À NOTER MAINTENANT (non réaffichés)%s\n' "$YLW$BOLD" "$RST"
  # Le super-admin PLATEFORME n'a PAS d'interface web : c'est une API (gestion
  # des établissements). L'espace /admin du site est l'administration DE
  # L'ÉCOLE, où ces identifiants-ci ne fonctionnent pas. Le récapitulatif
  # annonçait « connexion : <site>/ (module super-admin) », une page qui
  # n'existe pas — le client la cherchait en vain.
  printf '  Super-admin PLATEFORME %s(API — aucune interface web)%s :\n' "$DIM" "$RST"
  printf '    email        : %s\n' "$ADMIN_EMAIL"
  printf '    mot de passe : %s%s%s\n' "$BOLD" "${SUPERADMIN_PW:-<voir la sortie ci-dessus>}" "$RST"
  printf '    usage        : POST %s/admin/login → JWT à présenter en « Authorization: Bearer <jeton> »\n' "$API_URL_HINT"
  printf '                   sur les routes /admin (créer, lister, supprimer un établissement).\n'
  printf '                   Alternative : en-tête « x-admin-api-key », valeur ADMIN_API_KEY de %s.\n' "$ENV_FILE"
  printf '                   Détail et exemples : DEPLOY.md § « Administration de la plateforme ».\n'
  if [ -n "${ADMIN_LINK:-}" ]; then
    printf '\n  Administrateur de l’ÉCOLE %s(interface web : %s/admin)%s — lien de définition de mot de passe (24 h) :\n' "$DIM" "$APP_URL" "$RST"
    printf '    %s%s%s\n' "$BOLD" "$ADMIN_LINK" "$RST"
    [ -z "$SMTP_HOST" ] && printf '    %s(SMTP non configuré : transmettez ce lien à la main.)%s\n' "$DIM" "$RST"
  fi

  # Ce qui a été posé automatiquement : sans cette liste, l'administrateur
  # découvre une collection et des classes qu'il n'a pas créées et se demande
  # d'où elles sortent — ou pire, recrée les siennes en double.
  printf '\n%sCréé automatiquement (modifiable et supprimable)%s\n' "$BOLD" "$RST"
  printf '  Collection « Fonds numérique de l’établissement » + sa règle d’accès :\n'
  printf '    les documents numérisés y sont ajoutés au fur et à mesure et sont\n'
  printf '    lisibles par tout membre inscrit et actif de cet établissement.\n'
  printf '  5 classes d’exemple (L1 à M2), repérables au suffixe « (exemple) ».\n'
  printf '  %sRien à créer pour commencer : téléversez un document, il est accessible.%s\n' "$DIM" "$RST"

  printf '\n%sDonnées%s\n' "$BOLD" "$RST"
  printf '  Volumes Docker : %s_db_data, %s_minio_data, %s_meili_data…\n' "$vol_prefix" "$vol_prefix" "$vol_prefix"
  printf '  Configuration  : %s/%s (chmod 600 — contient les secrets)\n' "$REPO_ROOT" "$ENV_FILE"

  printf '\n%sÀ faire ensuite%s\n' "$BOLD" "$RST"
  printf '  1. %sActivez les sauvegardes%s : ./scripts/backup/backup.sh (cron quotidien — voir scripts/backup/README.md).\n' "$BOLD" "$RST"
  printf '  2. %sActivez la 2FA%s sur le compte administrateur (Mon compte → Sécurité) dès la première connexion.\n' "$BOLD" "$RST"
  # Le DNS n'est plus listé ici : il est annoncé EN TÊTE d'installation et
  # vérifié avant le démarrage de Caddy (announce_dns / check_dns).
  printf '\n'
}

main() {
  parse_args "$@"
  printf '%s%sGafeso — installateur%s\n' "$BOLD" "$CYN" "$RST"
  [ -f "$COMPOSE_FILE" ] || die "Lancez ce script depuis la racine du dépôt Gafeso."
  [ -n "$CONFIG_FILE" ] && load_config
  collect_answers   # les réponses (dont le moteur) pilotent le check RAM
  derive_config
  announce_dns      # AVANT tout travail : le client peut créer ses DNS pendant l'installation
  check_prereqs
  write_env
  check_dns         # dernier point de contrôle juste avant de lancer Caddy/ACME
  compose_up
  provision
  recap
}

main "$@"
