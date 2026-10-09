# ─────────────────────────────────────────────────────────────
# Gafeso API (NestJS) — image de production
#
# Construire depuis la RACINE du monorepo (contexte requis pour les
# workspaces npm) :
#   docker build -f apps/api/Dockerfile -t gafeso-api .
#
# Quatre étapes :
#   1. pruner    — turbo prune : ne garde que ce dont @gafeso/api
#                  dépend (source + lockfile réduit), depuis le monorepo complet
#   2. installer — installe TOUTES les dépendances (dev incluses) du
#                  sous-ensemble élagué, à partir du lockfile réduit
#   3. builder   — génère le client Prisma, compile TypeScript (nest build)
#   4. runner    — dépendances de PRODUCTION uniquement + dist compilé +
#                  client Prisma généré ; utilisateur non-root, image finale
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
# openssl : requis par le moteur Prisma sur Alpine (sinon "Unable to
# require libquery_engine"). libc6-compat : dépendances natives diverses.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ── 1. Élagage du monorepo (turbo prune) ──
FROM base AS pruner
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune @gafeso/api --docker

# ── 2. Installation complète (dev incluses, nécessaire pour le build) ──
# Le lockfile ÉLAGUÉ par `turbo prune` (out/package-lock.json) perd les
# entrées de dépendances imbriquées dans un node_modules de workspace (ex.
# apps/api/node_modules/meilisearch, non hissée à la racine) — `npm ci`
# avec ce lockfile réduit installe alors un arbre incomplet, silencieusement
# (aucune erreur au build, crash seulement au démarrage : "Cannot find
# module 'meilisearch'"). On utilise donc le lockfile RACINE complet, connu
# correct, avec les seuls package.json élagués — `npm ci` n'installe que ce
# que ces package.json référencent, le reste du lockfile est juste ignoré.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY package-lock.json ./package-lock.json
RUN npm ci

# ── 3. Build : client Prisma + compilation TypeScript ──
FROM base AS builder
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
# apps/api/tsconfig.json fait `extends: "../../tsconfig.json"` — un fichier
# racine que `turbo prune` ne copie PAS (il ne connaît que les package.json
# des workspaces). Sans lui, tsc retombe sur des options par défaut sans
# `experimentalDecorators`/`emitDecoratorMetadata`, et nest build échoue en
# cascade sur tous les décorateurs NestJS (nombreuses erreurs TS1240).
COPY tsconfig.json ./tsconfig.json
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build -w @gafeso/api

# ── 4. Dépendances de production uniquement (image finale plus légère) ──
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
COPY package-lock.json ./package-lock.json
RUN npm ci --omit=dev
# npm (workspaces) peut, selon le lockfile, TOUT hisser dans le node_modules
# racine (auquel cas apps/api/node_modules n'existe pas) OU en imbriquer une
# partie sous apps/api/node_modules. Depuis la régénération du lockfile, tout
# est hissé à la racine et ce dossier n'existe plus → le COPY final échouait
# ("not found"). On garantit son existence pour rendre le COPY robuste aux DEUX
# layouts : dossier présent → ses deps imbriquées sont copiées ; absent → il
# est vide et tout est déjà couvert par le node_modules racine.
RUN mkdir -p apps/api/node_modules

# ── 5. Image finale ──
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# LA VERSION QUI TOURNE — posée au BUILD, lue de git par
# `scripts/version-du-depot.sh`, jamais tapée à la main.
#
# ⚠ Les défauts ci-dessous sont les réponses HONNÊTES d'un build fait sans ces
# arguments (un `docker build` à la main) : « non étiquetée » plutôt qu'un
# numéro plausible. Un ARG non passé arrive comme chaîne VIDE, c'est pourquoi
# `version.ts` borne sur le CONTENU et pas sur la présence.
#
# ⚠ Posés sur l'étage `runner` seulement : un ARG sur un étage de build
# invaliderait le cache de compilation à CHAQUE commit, pour deux chaînes qui
# n'entrent dans aucun calcul.
# 🔴 PLUS DE DÉFAUT, ET UN REFUS — 9 octobre 2026.
#
# Les défauts « non étiquetée » / « inconnu » étaient les réponses HONNÊTES d'un
# build fait sans arguments. Ils rendaient aussi l'OUBLI indiscernable du choix :
# un `up -d --build` sans `eval "$(scripts/version-du-depot.sh --exporter)"`
# produisait une image muette sur sa version, et personne ne le savait avant
# d'interroger `/health`. Constaté au déploiement de rc7.
#
# ⚠ `version.ts` garde sa tolérance : une valeur vide y devient « non étiquetée ».
# C'est juste — un conteneur lancé à la main doit DIRE qu'il ne sait pas. Ce
# refus-ci porte sur la CONSTRUCTION, qui est un geste délibéré avec une
# commande à lancer. Les deux ne se contredisent pas : on refuse de FABRIQUER
# une image sans version, on n'interdit pas d'en EXÉCUTER une.
ARG GAFESO_VERSION=""
ARG GAFESO_COMMIT=""
RUN if [ -z "$GAFESO_VERSION" ] || [ -z "$GAFESO_COMMIT" ]; then \
      echo "" >&2; \
      echo "=== REFUS DE CONSTRUIRE — la version n'est pas posée ===" >&2; \
      echo "" >&2; \
      echo "  GAFESO_VERSION=[$GAFESO_VERSION]  GAFESO_COMMIT=[$GAFESO_COMMIT]" >&2; \
      echo "" >&2; \
      echo "  Cette image repondrait « non etiquetee / inconnu » sur /health," >&2; \
      echo "  sans aucun avertissement. Posez la version AVANT de construire :" >&2; \
      echo "" >&2; \
      echo "    git fetch --tags && git checkout <etiquette>" >&2; \
      echo "    V=\"\$(scripts/version-du-depot.sh --exporter)\" || exit 1" >&2; \
      echo "    eval \"\$V\"" >&2; \
      echo "    docker compose --env-file .env.prod -f docker/docker-compose.prod.yml build" >&2; \
      echo "" >&2; \
      echo "  La sequence complete est en tete de DEPLOY.md." >&2; \
      echo "" >&2; \
      exit 1; \
    fi
ENV GAFESO_VERSION=$GAFESO_VERSION
ENV GAFESO_COMMIT=$GAFESO_COMMIT

RUN addgroup -S gafeso && adduser -S gafeso -G gafeso

# Dépendances de prod : node_modules RACINE (où npm hisse l'essentiel) + le
# node_modules imbriqué du workspace api (garanti existant par le mkdir en
# étape prod-deps ; vide si tout est hissé, sinon porte les deps non hissées).
# + client Prisma généré (superposé : prod-deps n'a pas exécuté `prisma generate`).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=pruner /app/out/full/package.json ./package.json
# scripts/ (seed-demo.mjs, provision-production.mjs) : exécutés en prod via
# `docker compose exec api node scripts/...` — voir DEPLOY.md. Copiés tels
# quels depuis le contexte de build (racine du monorepo), pas de compilation.
COPY scripts ./scripts

# L'ÉTAT LOCAL DU CONTENEUR — aujourd'hui le seul fichier qui y vit est le jeton
# d'amorçage de l'assistant d'installation.
#
# ⚠ TROUVÉ EN ÉCRIVANT DEPLOY.md, le 6 octobre 2026, et pas par la recette : elle
# surchargeait `GAFESO_JETON_INSTALLATION_FICHIER` vers un répertoire temporaire,
# donc elle n'a jamais exercé le chemin par défaut. Sans ce `mkdir`, le premier
# démarrage d'une instance NEUVE aurait levé `ENOENT` sur /app/etat — exactement
# la famille « le clone frais vérifie la PRÉSENCE, pas l'EXÉCUTION » : la recette
# éprouvait un chemin qui n'est pas celui de la production.
#
# ⚠ Il N'EST PAS déclaré en VOLUME, délibérément. Le jeton ne doit pas survivre à
# la destruction du conteneur : il est régénéré à chaque démarrage tant que
# l'installation reste à faire, et un jeton qui persiste dans un volume que
# personne ne nettoie est le défaut mesuré du 9 septembre.
RUN mkdir -p /app/etat

# Script d'entrée : applique les migrations Prisma puis démarre l'API.
COPY apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh && chown -R gafeso:gafeso /app

USER gafeso
EXPOSE 4000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
