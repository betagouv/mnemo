# ADR 0010 — BCF persistence and interoperability

## Status

Accepted for the topic and comment foundation. Viewpoints and BCF ZIP exchange
are a separate feature.

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
  directly from tRPC procedures or React components.
- Viewpoint metadata will be stored in PostgreSQL and snapshot binaries in
  S3/MinIO. Project and topic deletion must clean those objects through an
  idempotent background job.
- `@ifc-lite/bcf` will be used at the interoperability boundary to create and
  parse standard BCF archives and to map viewer camera/visibility state. It does
  not own Mnemo's database schema or UI.

## Consequences

Topics and comments are queryable and immediately collaborative while remaining
exportable to BCF. A component link remains meaningful after source-file
cleanup. The first slice does not yet claim viewpoint, screenshot, or `.bcfzip`
support; those require object-storage lifecycle handling and viewer-state
capture before they can be added safely.
