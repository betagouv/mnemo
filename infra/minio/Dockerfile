FROM golang:1.24.9-bookworm AS build-base

ENV CGO_ENABLED=0
ENV GOFLAGS=-trimpath

FROM build-base AS server-build
ARG MINIO_VERSION=RELEASE.2025-10-15T17-29-55Z
WORKDIR /src
RUN --mount=type=cache,target=/go/pkg/mod \
  --mount=type=cache,target=/root/.cache/go-build \
  git clone --branch "${MINIO_VERSION}" --depth 1 https://github.com/minio/minio.git . \
  && mkdir -p /out \
  && for attempt in 1 2 3; do go mod download && break; test "${attempt}" -eq 3 && exit 1; sleep 2; done \
  && LDFLAGS="$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go)" \
  && go build -tags kqueue -trimpath --ldflags "${LDFLAGS}" -o /out/minio .

FROM build-base AS client-build
ARG MC_VERSION=RELEASE.2025-08-13T08-35-41Z
WORKDIR /src
RUN --mount=type=cache,target=/go/pkg/mod \
  --mount=type=cache,target=/root/.cache/go-build \
  git clone --branch "${MC_VERSION}" --depth 1 https://github.com/minio/mc.git . \
  && mkdir -p /out \
  && for attempt in 1 2 3; do go mod download && break; test "${attempt}" -eq 3 && exit 1; sleep 2; done \
  && LDFLAGS="$(MC_RELEASE=RELEASE go run buildscripts/gen-ldflags.go)" \
  && go build -tags kqueue -trimpath --ldflags "${LDFLAGS}" -o /out/mc .

FROM debian:bookworm-slim AS runtime-base
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

FROM runtime-base AS server
COPY --from=server-build /out/minio /usr/local/bin/minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]

FROM runtime-base AS client
COPY --from=client-build /out/mc /usr/local/bin/mc
ENTRYPOINT ["mc"]
