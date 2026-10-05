# ADR 0013 — Persistent assistant threads

- Status: Accepted
- Date: 2026-09-09

## Context

The assistant must survive page reloads and support several conversations for
the same IFC without mixing data between projects, assets, or users. The final
assistant message is produced as a stream and may contain frontend or MCP tool
parts in addition to text.

## Decision

Store thread metadata and ordered AI SDK UI messages in PostgreSQL. A thread is
scoped by `createdBy`, `projectId`, and `assetId`; every application operation
first authorizes the IFC asset for the current actor. Messages keep their whole
validated JSON payload so tool traces and model metadata are not flattened or
lost.

Thread mutations use named Server Actions and history uses an authenticated GET
route. The model stream remains a dedicated route because it speaks the AI SDK
SSE protocol. That route requires
an authorized thread ID and uses AI SDK v7 `originalMessages` plus `onEnd` to
atomically replace the ordered message snapshot after every streamed step. A
failure to persist is logged with the asset and thread IDs but does not corrupt
the stream already delivered to the user.

The client creates, selects, and deletes threads independently of the viewer
controller. Changing threads remounts only the assistant runtime; the IFC-Lite
renderer, GPU resources, camera, selection, and point-cloud LOD remain alive.

## Consequences

- Reloading a viewer restores the most recently updated conversation.
- Assets and projects delete their conversations through database cascades.
- A future authentication layer can replace the development actor without a
  schema redesign.
- Thread search, retention, and quotas can be added around the repository port
  without changing the model transport or viewer tool registry.
