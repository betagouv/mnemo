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

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/processing-worker/dist ./dist
USER node
CMD ["node", "dist/index.cjs"]
