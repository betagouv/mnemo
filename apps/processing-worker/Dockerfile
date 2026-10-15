FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

FROM base AS pruner
WORKDIR /workspace
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @mnemo/processing-worker --docker

FROM base AS dependencies
WORKDIR /workspace
COPY --from=pruner /workspace/out/json/ ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
WORKDIR /workspace
COPY --from=pruner /workspace/out/full/ ./
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm --filter @mnemo/processing-worker build

FROM node:22-bookworm-slim AS untwine-converter
WORKDIR /app
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl bzip2 \
  && rm -rf /var/lib/apt/lists/*
COPY infrastructure/scalingo-copc/scripts/install-untwine.sh scripts/install-untwine.sh
COPY infrastructure/scalingo-copc/scripts/untwine scripts/untwine
RUN bash scripts/install-untwine.sh

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV UNTWINE_PATH=/opt/pdal/bin/untwine
WORKDIR /app
RUN groupadd --system --gid 1001 mnemo \
  && useradd --system --uid 1001 --gid mnemo --home-dir /app mnemo
COPY --from=untwine-converter /app/bin /opt/pdal/bin
COPY --from=build --chown=mnemo:mnemo /workspace/apps/processing-worker/dist ./dist
USER mnemo
CMD ["node", "dist/process-point-cloud-once.js"]
