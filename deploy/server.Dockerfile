# Game server image: Fastify API plus its Postgres migrations.
# Build from the repository root: docker build -f deploy/server.Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN pnpm --filter @l2n/shared --filter @l2n/server build \
 && pnpm --filter @l2n/server deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --start-interval=2s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Apply pending migrations, then start. The runner is forward-only and idempotent.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/index.js"]
