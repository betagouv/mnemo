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
RUN pnpm --filter @mnemo/processing-worker build

FROM debian:bookworm-slim AS potree-converter
ARG POTREE_CONVERTER_COMMIT=d9387d52807bf8936fe98096b9992ea13b50ba94
RUN apt-get update \
  && apt-get install --yes --no-install-recommends build-essential ca-certificates cmake git libtbb-dev \
  && git init /source \
  && git -C /source remote add origin https://github.com/potree/PotreeConverter.git \
  && git -C /source fetch --depth 1 origin "${POTREE_CONVERTER_COMMIT}" \
  && git -C /source checkout --detach FETCH_HEAD \
  && cmake -S /source -B /source/build \
  && cmake --build /source/build --parallel 2

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
ENV LD_LIBRARY_PATH=/usr/local/lib
ENV MNEMO_LOCAL_POTREE_BINARY=/app/potree-once.js
ENV POTREE_CONVERTER_PATH=/usr/local/bin/PotreeConverter

RUN apt-get update \
  && apt-get install --yes --no-install-recommends libtbb12 \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=potree-converter /source/build/PotreeConverter /usr/local/bin/PotreeConverter
COPY --from=potree-converter /source/build/liblaszip.so /usr/local/lib/liblaszip.so
COPY --from=build --chown=nextjs:nodejs /workspace/apps/processing-worker/dist/process-point-cloud-once.js /app/potree-once.js

COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
