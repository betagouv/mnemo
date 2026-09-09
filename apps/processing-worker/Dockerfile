FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

FROM base AS dependencies
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/processing-worker/package.json apps/processing-worker/package.json
RUN pnpm install --frozen-lockfile --filter @mnemo/processing-worker...

FROM dependencies AS build
WORKDIR /workspace
COPY tsconfig.base.json ./
COPY apps/processing-worker apps/processing-worker
RUN pnpm --filter @mnemo/processing-worker build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/processing-worker/dist ./dist
USER node
CMD ["node", "dist/index.js"]
