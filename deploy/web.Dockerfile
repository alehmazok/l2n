# Web image: Caddy serving the built PWA, proxying the API to the server
# and getting TLS certificates automatically when SITE_ADDRESS is a domain.
# Build from the repository root: docker build -f deploy/web.Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/client packages/client
RUN pnpm --filter @l2n/client build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/packages/client/dist /srv
