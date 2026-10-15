# ADR 0015: Keep IFC originals in S3 and run Potree only on demand

- Status: accepted
- Date: 2026-10-13
- Supersedes: [ADR 0006](0006-persistent-processing-leases.md) and [ADR 0008](0008-ifc-lite-server-distribution.md) where they require a permanent processing worker or a Rust-only runtime image.
- Format update: [ADR 0016](0016-copc-only-point-clouds.md) replaces the Potree conversion mentioned below with COPC. The S3-only one-off boundary remains accepted.

## Context

The browser must upload and view IFC files larger than the public HTTP ingress limit without transferring the original through Next.js. A permanent processing-worker application adds cost and operational complexity even though IFC geometry is needed only when a model is opened and Potree conversion is a finite job. PostgreSQL remains the source of truth for asset ownership and durable job state; S3 stores originals and derived point-cloud artifacts.

## Decision

The browser uploads originals directly to S3 using short-lived, per-object signed PUT URLs. Next.js confirms the object size with `HeadObject`, authorizes every viewer request, and signs a short-lived GET URL for an IFC original. An authenticated gateway in the `mnemo-ifc-rust` application reads that URL and streams the original to the IFC-Lite Rust binary in the same container. Geometry batches and the data model flow back to the viewer through authenticated Next.js routes; large IFC originals are never downloaded into the browser's columnar parser.

Next.js also polls the existing durable point-cloud and deletion queues. A LAS/LAZ conversion runs in a disposable local container/process or a Scalingo one-off with S3 credentials but no database connection. Next.js observes its result in S3 and commits the status in PostgreSQL. No separate permanent processing-worker application is deployed. Rust has no database credentials and only receives the single signed object URL, not S3 credentials.

## Consequences

- Large IFC uploads avoid the ingress request-size limit. Server memory, timeout, output volume, and `MAX_FILE_SIZE_MB` still constrain the largest usable model and require representative load tests.
- The browser can show partial geometry while Rust streams. The Rust cache is disposable, so reopening after a restart may require reprocessing.
- Web instances may safely compete for database jobs using leases, but a live web instance must run the background loops (`MNEMO_BACKGROUND_JOBS=1`) for point clouds and deletions to advance.
- S3 credentials and the Rust bearer token are scoped to server environments. Signed URLs are short-lived and object-specific; the gateway validates the source origin and path.
- Scalingo Potree has zero standing containers but incurs one-off runtime and S3 transfer costs. Local development keeps the same S3 contract with MinIO.
