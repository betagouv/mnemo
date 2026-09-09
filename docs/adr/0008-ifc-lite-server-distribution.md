# ADR 0008: Build the IFC-Lite server from its pinned binary package

- Status: accepted
- Date: 2026-09-09

## Context

IFC-Lite recommends its Rust server for large IFC processing, Parquet generation, streaming, and reusable geometry caches. The documented GHCR image cannot currently be pulled anonymously in the local development environment.

IFC-Lite also publishes `@ifc-lite/server-bin`, whose installer downloads the platform-specific Rust binary and verifies its release checksum. The distribution package and embedded server use independent version numbers: package `1.17.0` currently provides server `9.2.0`.

## Decision

Build a small local image from the pinned `@ifc-lite/server-bin@1.17.0` package. Node.js is present only in the download stage; the runtime image contains the native server binary, CA certificates, and the health-check client.

Run the server as a non-root user. Mount `/app/cache` as a dedicated Docker volume and treat it as disposable processing data. Original IFC files remain in S3-compatible object storage.

## Consequences

- Local development does not depend on access to the GHCR image.
- A package upgrade is an explicit source change and Docker rebuild.
- Health output must be used to observe the embedded server version independently from the npm package version.
- Recreating the cache volume may cost processing time but cannot lose an original model.
