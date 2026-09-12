# Build depuis la racine du monorepo : docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
# Outils de compilation pour le module natif better-sqlite3, uniquement dans
# cet étage — jamais dans l'image finale.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN pnpm --filter @mirrorball/api build

FROM node:22-bookworm-slim AS runtime
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/package.json

EXPOSE 8787
CMD ["node", "apps/api/dist/index.js"]
