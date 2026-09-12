# Build depuis la racine du monorepo : docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
# Vite fige ces valeurs dans le bundle au build — impossible de les changer
# au démarrage du conteneur, contrairement à un serveur classique.
ARG VITE_SPOTIFY_CLIENT_ID
ARG VITE_SPOTIFY_REDIRECT_URI
ARG VITE_API_BASE_URL
ENV VITE_SPOTIFY_CLIENT_ID=$VITE_SPOTIFY_CLIENT_ID \
    VITE_SPOTIFY_REDIRECT_URI=$VITE_SPOTIFY_REDIRECT_URI \
    VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN pnpm --filter @mirrorball/web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
