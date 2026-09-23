# Build context must be the repository root:
#   docker build -f packages/demos/hono-api/Dockerfile .
FROM node:26 AS base

RUN npm i -g pnpm@12

#
#
# build dependencies
FROM base AS builder

WORKDIR /build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY .npmrc* ./
COPY packages/dispatchit/package.json packages/dispatchit/
COPY packages/demos/hono-api/package.json packages/demos/hono-api/

RUN pnpm install --frozen-lockfile

COPY packages/dispatchit/ packages/dispatchit/
COPY packages/demos/hono-api/ packages/demos/hono-api/

# the demo consumes the dispatchit SDK via its built dist — build it first
RUN pnpm --filter dispatchit build

#
#
# run server
FROM node:26-slim AS runner

ENV NODE_ENV=production \
    DEMO_API_HOST=0.0.0.0 \
    DEMO_API_PORT=4100

WORKDIR /app
COPY --from=builder /build /app

USER node

EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

WORKDIR /app/packages/demos/hono-api
CMD ["node", "--import", "tsx", "src/index.ts"]
