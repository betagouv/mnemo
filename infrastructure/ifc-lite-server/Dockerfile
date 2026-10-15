FROM node:22-bookworm-slim AS downloader

RUN npm install --global @ifc-lite/server-bin@2.0.0 \
  && ifc-lite-server download \
  && cp /usr/local/lib/node_modules/@ifc-lite/server-bin/.cache/ifc-lite-server /ifc-lite-server

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 ifclite \
  && mkdir -p /app/cache \
  && chown ifclite:ifclite /app/cache

COPY --from=downloader /ifc-lite-server /usr/local/bin/ifc-lite-server
COPY infrastructure/scalingo-ifc-rust/scripts/gateway.mjs /app/gateway.mjs

USER ifclite
WORKDIR /app

ENV PORT=8080 \
  CACHE_DIR=/app/cache/batch-10 \
  RUST_LOG=info \
  MAX_FILE_SIZE_MB=1024 \
  REQUEST_TIMEOUT_SECS=900 \
  IFC_ADMISSION_QUEUE_TIMEOUT_SECS=120 \
  WORKER_THREADS=4 \
  INITIAL_BATCH_SIZE=10 \
  MAX_BATCH_SIZE=10 \
  CACHE_MAX_AGE_DAYS=7
ENV IFC_SERVER_BINARY=/usr/local/bin/ifc-lite-server

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=12 \
  CMD curl --fail http://localhost:8080/api/v1/health || exit 1

ENTRYPOINT ["node", "/app/gateway.mjs"]
