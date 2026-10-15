# ADR 0016: Use COPC as the sole tiled point-cloud format

- Status: accepted
- Date: 2026-10-14
- Supersedes: [ADR 0009](0009-point-cloud-ingestion-and-rendering.md) for LAS/LAZ conversion and LOD transport. The S3-only one-off boundary from [ADR 0015](0015-s3-native-ifc-and-oneoff-processing.md) remains unchanged.

## Context

The development system carried two conversion and streaming implementations:
Potree v2 and COPC. COPC is now the chosen tiled format, so retaining both
paths increases build cost, test surface and viewer branching without a required
compatibility use case. Uploaded originals remain the source of truth.

## Options considered

- **Keep both formats:** existing derived objects remain viewable, but conversion,
  API and rendering code must be maintained twice.
- **Use COPC only:** one S3 object, one signed URL and IFC-Lite's COPC range
  reader. Existing derived results require a fresh upload of their originals.

## Decision

LAS/LAZ one-offs use Untwine to publish one `cloud.copc.laz` under an
attempt-specific S3 prefix. Next.js validates that object and records the COPC
result. The browser uses IFC-Lite's COPC reader for camera-driven range loading
in the existing WebGPU scene. E57/PLY keep their bounded preview path. The
one-off remains stateless and has no PostgreSQL credentials.

The old conversion and viewer code is removed. Applied Prisma migrations and
legacy object-key columns remain temporarily so existing development rows and
their S3 deletion references are not silently discarded. Legacy LAS/LAZ
results are not displayed; delete the affected asset and upload its original
again to reconvert it. A
separate, explicit data-cleanup decision is needed before dropping those
columns or deleting old derived objects.

## Consequences

- **Benefits:** one conversion binary, one artifact contract and one viewer LOD
  path; smaller builds and less custom decoding code.
- **Costs and risks:** existing non-COPC derivatives stop displaying until
  reuploaded; COPC conversion still needs significant temporary disk and time.
- **Follow-up:** reupload wanted development assets and remove old results and
  their S3 objects through normal asset deletion. The schema-cleanup migration
  refuses to drop the old key columns while any legacy result remains.

## Validation and review

Typecheck, unit tests, a local LAS/LAZ conversion and browser range-loading
against a representative COPC must pass. Revisit only if a measured COPC
limitation cannot be addressed within the current IFC-Lite reader.
