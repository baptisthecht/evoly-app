FROM node:20-alpine AS base
RUN npm install -g pnpm@9.0.0

WORKDIR /workspace

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/app/package.json ./apps/app/
COPY apps/web/package.json ./apps/web/
COPY apps/scanner/package.json ./apps/scanner/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/email/package.json ./packages/email/
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile

# Development image
FROM base AS dev
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .
EXPOSE 3001
CMD ["pnpm", "--filter", "@evoly/app", "dev"]
