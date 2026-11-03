# ADR 0010 — BCF persistence and interoperability

## Status

Superseded in part by [ADR 0018](0018-bcf-workspace.md).

## Context

BCF is both an interoperability format and a collaboration workflow. Mnemo must
support project-level permissions, live status changes, comments, and links to
IFC components even when an uploaded model is replaced or deleted. A ZIP file
alone is not an adequate transactional store for those application concerns.

The current `@ifc-lite/bcf` package supports BCF 2.1 and 3.0 topics, comments,
component references, viewpoints, cameras, visibility state, section planes,
snapshots, and archive import/export.

## Decision

- PostgreSQL is the source of truth for live BCF topics, comments, status,
  priority, authorship, and project authorization.
- IFC components are referenced durably by `GlobalId`. The current asset ID and
  Express ID are optional navigation hints; deleting an asset clears its foreign
  key but preserves the BCF component and its `GlobalId`.
- Topic writes pass through application services and project permissions, not
  directly from transport handlers or React components.
- Viewpoint camera, selection, visibility, and coloring are normalized through
  `@ifc-lite/bcf` and stored in PostgreSQL. Snapshot binaries are uploaded
  directly to S3/MinIO through short-lived signed URLs.
- Renderer-specific target distance is retained beside the standard BCF camera
  so restored orbit controls feel identical. It remains an application hint and
  is not written as a non-standard BCF field.
- Project deletion snapshots all viewpoint object keys and cleans them through
  the existing idempotent background job.
- `@ifc-lite/bcf` will be used at the interoperability boundary to create and
  parse standard BCF archives and to map viewer camera/visibility state. It does
  not own Mnemo's database schema or UI.
- BCF ZIP exchange uses a dedicated binary route rather than encoding archives
  inside JSON. The route delegates authorization and mapping to the BCF
  application service.
- Imported BCF topic, comment, and viewpoint GUIDs are stored separately from
  Mnemo record IDs. A per-project uniqueness constraint makes repeated imports
  idempotent while preserving protocol identity on re-export.
- Imported authors remain visible as external author labels while the current
  authenticated actor remains the auditable database author of the import.
- Compressed size, expanded size, entry count, topic count, comment count,
  viewpoint count, and screenshot sizes are bounded before persistence.
- Imported screenshots are written to S3/MinIO before the database transaction;
  failed or duplicate imports trigger best-effort object cleanup.

## Consequences

Topics and comments are queryable and immediately collaborative while remaining
exportable to BCF. A component link remains meaningful after source-file
cleanup. Captured viewpoints restore camera, selection, visibility, and colors
without recreating the WebGPU renderer or reframing the model. BCF 2.1 and 3.0
archives can be imported; Mnemo exports BCF 3.0 and supplies a neutral aspect
ratio only when a legacy 2.1 viewpoint did not contain one.
