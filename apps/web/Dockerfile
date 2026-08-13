# ─────────────────────────────────────────────────────────────
# Gafeso Web (Next.js) — image de production
#
# Construire depuis la RACINE du monorepo (contexte requis pour les
# workspaces npm) :
#   docker build -f apps/web/Dockerfile \
#     --build-arg API_URL=http://api:4000 \
#     -t gafeso-web .
#
# API_URL doit pointer vers le nom du service API tel qu'il apparaît dans
# le réseau Docker au moment du BUILD (figé dans la sortie standalone —
# voir le commentaire sur ARG API_URL plus bas).
#
# Même schéma en 4 étapes que apps/api/Dockerfile (turbo prune), avec
# la sortie "standalone" de Next.js : le build calcule par traçage les
# seuls fichiers node_modules réellement utilisés au runtime, bien plus
# léger qu'embarquer node_modules complet.
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
# libc6-compat : requis par certains paquets natifs sous Next.js/Node sur Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ── 1. Élagage du monorepo (turbo prune) ──
FROM base AS pruner
RUN npm install -g turbo@^2.5.0
COPY . .
RUN turbo prune @gafeso/web --docker

# ── 2. Installation complète (dev incluses, nécessaire pour le build) ──
# Le lockfile ÉLAGUÉ par `turbo prune` (out/package-lock.json) peut perdre
# des dépendances imbriquées dans node_modules d'un workspace plutôt que
# hissées à la racine (constaté avec meilisearch côté API — voir
# apps/api/Dockerfile) : `npm ci` installerait alors un arbre incomplet
# sans erreur visible. On utilise donc le lockfile RACINE complet, avec les
# seuls package.json élagués — `npm ci` n'installe que ce qu'ils référencent.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY package-lock.json ./package-lock.json
RUN npm ci

# ── 3. Build de production ──
FROM base AS builder
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
# NEXT_PUBLIC_* doivent être présentes au moment du build (inlinées dans le
# bundle client) — sans valeur d'intérêt ici (l'app appelle /api/* en
# same-origin), gardé pour extension future.
ENV NEXT_TELEMETRY_DISABLED=1
# apps/web/next.config.mjs lit `process.env.API_URL` pour construire la
# destination du rewrite `/api/:path*` — ce rewrite est résolu par
# `next build` et FIGÉ dans routes-manifest.json / required-server-files.json
# de la sortie standalone. Une variable API_URL passée à `docker run` au
# démarrage est donc IGNORÉE : elle doit être fournie ici, à la construction
# de l'image, via --build-arg. Défaut = nom du service `api` dans
# docker-compose.prod.yml (réseau Docker interne).
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN npm run build -w @gafeso/web

# ── 4. Image finale — sortie standalone ──
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S gafeso && adduser -S gafeso -G gafeso

# La sortie standalone copie déjà un node_modules minimal (fichiers
# réellement utilisés, tracés au build) + server.js autonome.
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=gafeso:gafeso /app/apps/web/.next/standalone ./
COPY --from=builder --chown=gafeso:gafeso /app/apps/web/.next/static ./apps/web/.next/static

USER gafeso
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
