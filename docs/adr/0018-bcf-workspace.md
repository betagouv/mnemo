# ADR 0018 — BCF workspace and loss-aware exchange

## Status

Accepted. Supersedes ADR 0010's vocabulary and snapshot-upload details.

## Context

BCF remarks need explicit multi-object associations, assignment, deadlines,
comments and previews before creation. The installed IFC-Lite BCF library already
provides archive exchange, camera/section conversions, coordinate-frame helpers
and marker positioning. Flattening its payloads and mapping foreign vocabulary
to application enums loses interoperability.

## Decision

- Keep PostgreSQL for collaboration and private S3 for image bytes. Keep project
  permissions in server use cases and IFC-Lite behind the existing adapters.
- Keep vocabulary configuration internal in V1; no public mutation endpoint or
  settings screen is exposed. Store bounded project-defined vocabulary as strings. Preserve imported values,
  external authors, protocol GUIDs, model headers and supported topic metadata.
- Keep a topic's explicit subject objects separate from visibility/coloring
  context. Preserve saved views; use a separate selection-only view when export
  needs to express subject references absent from other views.
- Keep previews local until save. A server-owned, actor/project-scoped receipt
  authorizes a short-lived direct image upload. Verify size, type and signature,
  copy to a permanent key, then atomically consume the receipt and persist the
  topic/comment/view. The existing deletion worker cleans abandoned uploads.
  A delayed cleanup job also protects the copy/transaction crash window; the
  successful transaction cancels that job before attaching the final object.
- Serve stable, authenticated snapshot URLs that redirect to fresh presigned S3
  links. Images use anonymous CORS for the COEP-isolated viewer; bucket contents
  remain private and every new image request checks project permissions.
- List summaries separately from detail. Opening a remark does not move the
  camera; restoring a saved view is an explicit command to the existing viewer.
- Store viewpoints in IFC world coordinates. Convert render-origin offsets using
  IFC-Lite when capturing/restoring; retain target distance as a local orbit hint.
- Reuse IFC-Lite marker positioning and project markers through the viewer camera;
  update DOM positions without scheduling React renders on every animation frame.
- Never invent an aspect ratio for imported BCF 2.1 views. Export 2.1 when any
  camera lacks it, otherwise 3.0. Report unsupported content instead of silently
  changing its meaning.

## Consequences

BCF schema and UI can evolve without a legacy compatibility path. Exchange
fidelity is limited by the installed library: bitmap image annotations and
embedded attachments are not implemented. Their presence must be reported.
The renderer supports a single arbitrary cut plane or an axis-aligned box;
other clipping combinations remain stored/exportable but restoration explicitly
reports the limitation. The UI uses React-DSFR controls and retains drafts when
its panel is closed.
