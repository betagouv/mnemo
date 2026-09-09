FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

FROM base AS pruner
WORKDIR /workspace
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @mnemo/web --docker

FROM base AS dependencies
WORKDIR /workspace
COPY --from=pruner /workspace/out/json/ ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
WORKDIR /workspace
COPY --from=pruner /workspace/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm --filter @mnemo/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
