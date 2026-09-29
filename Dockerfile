# syntax=docker/dockerfile:1.7
# Image de l'app Evoly (apps/app) : monorepo pnpm, construction sans base ni secret réel.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
# versions non figées volontairement : certificats et OpenSSL doivent recevoir les correctifs de sécurité à chaque construction
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /app

# 1. Dépendances : couche gardée en cache tant que le fichier de verrouillage ne change pas
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/app/package.json apps/app/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/i18n/package.json packages/i18n/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

# 2. Construction : les variables publiques sont figées dans le code envoyé au navigateur,
#    les autres sont factices (les vraies valeurs ne sont fournies qu'au démarrage)
FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BASE_DOMAIN
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SHORT_LINK_BASE
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
RUN test -n "$NEXT_PUBLIC_APP_URL" && test -n "$NEXT_PUBLIC_BASE_DOMAIN" || (echo "NEXT_PUBLIC_APP_URL et NEXT_PUBLIC_BASE_DOMAIN sont requis à la construction" && exit 1)
RUN export DATABASE_URL=postgresql://construction:construction@localhost:5432/construction \
      BETTER_AUTH_SECRET=construction-uniquement-0123456789abcdef-0123456789 \
      BETTER_AUTH_URL="$NEXT_PUBLIC_APP_URL" \
 && pnpm --filter @evoly/db exec prisma generate \
 && pnpm --filter @evoly/app build

# 3. Exécution : utilisateur non privilégié, contrôle de santé sur /api/health (vérifie aussi la base)
FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOADS_DIR=/data/uploads
COPY --from=build --chown=node:node /app /app
RUN install -d -o node -g node /data/uploads
USER node
WORKDIR /app/apps/app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
