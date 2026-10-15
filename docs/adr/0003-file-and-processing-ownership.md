# ADR 0003: Separate file ownership from processing caches

- Status: accepted
- Date: 2026-09-09

## Context

IFC and point-cloud files can be too large to proxy through the web process. IFC-Lite processing servers and Potree-compatible octrees need derived artifacts, but those artifacts must not replace the uploaded source file.

## Decision

Store original files and derived binary artifacts in S3-compatible object storage. Use MinIO locally. PostgreSQL is the source of truth for projects, memberships, assets, versions, transforms, processing jobs, and artifact metadata.

Browsers upload large files directly with short-lived presigned URLs. A committed upload creates an idempotent processing job. Workers obtain private object-storage access and call the relevant IFC or point-cloud adapters. IFC-Lite caches and temporary local copies are disposable.

Deletion is asynchronous and idempotent. It removes derived artifacts, originals, processing caches, and database records while retaining enough job state to retry partial failure safely.

For the current implementation, [ADR 0015](0015-s3-native-ifc-and-oneoff-processing.md)
places IFC parsing in the Rust service on viewer open, and
[ADR 0016](0016-copc-only-point-clouds.md) selects COPC for LAS/LAZ derivatives.
The earlier Potree and generic worker wording above is historical, not an
additional active processing path.

## Consequences

- Restarting or replacing an IFC-Lite server cannot lose an original model.
- The web runtime does not buffer large uploads.
- Every stored object is reachable through an application-owned asset or artifact record.
- Cleanup requires an explicit, tested workflow rather than a database cascade alone.
