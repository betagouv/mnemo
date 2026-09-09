# ADR 0012 — Dedicated IFC-Lite MCP runtime

- Status: Accepted
- Date: 2026-09-09

## Context

The assistant needs the semantic IFC tools shipped by `@ifc-lite/mcp` without
moving rendering away from Mnemo's WebGPU viewer. The MCP server accepts local
file paths, while originals belong in S3-compatible storage. Its HTTP transport
also owns model state per MCP session, so parsing a large model for every chat
turn would be prohibitively expensive.

## Decision

Run pinned `@ifc-lite/mcp@0.13.1` as a dedicated, non-root HTTP runtime protected
by a bearer token. The Next.js application authorizes the project and asset
before it creates any MCP session. It streams the immutable original from MinIO
to an atomic, asset-ID-owned file in a shared Docker volume; this volume is a
disposable cache, not a source of truth.

The runtime itself registers only `model_load` and the approved read tools.
`model_load` requires IFC-Lite's `mutate` scope, so scope filtering alone is not
sufficient: mutation, BCF-writing, export, and WebGL viewer tools do not exist in
this server's tool registry. Loads are additionally constrained to
`/app/models`, mounted read-only in the MCP container. Its host port binds only
to loopback; Docker services reach it on the private Compose network.

Keep at most two live MCP sessions by default and reuse a session for successive
turns on the same asset. The model is loaded with a server-generated path and
ID. A second explicit allowlist of discovery, query, property, relationship,
spatial, material, georeferencing, and measurement tools is passed to the
language model, excluding even `model_load`. Scene actions continue to use
browser tools against the single existing WebGPU controller.

IFC-Lite 0.13.1 upgrades a request to a persistent SSE response whenever its
`Accept` header contains `text/event-stream`; AI SDK MCP 2.0.47 advertises JSON
and SSE together. Mnemo's adapter forces `Accept: application/json` for POST
requests, using IFC-Lite's supported finite JSON response path. This adapter can
be removed when the upstream transports interoperate directly.

Asset and project deletion close local MCP sessions and remove working copies.
The background deletion worker repeats disk cleanup idempotently. Originals
remain governed by the existing MinIO deletion workflow.

## Consequences

- Server-side BIM questions use IFC-Lite's current MCP tools rather than custom
  property-query implementations.
- The first assistant turn may copy and parse the IFC; later turns reuse the
  bounded in-memory session.
- Recreating the MCP cache volume or service loses only derived state and causes
  a safe reload from MinIO.
- Horizontal scaling will require a deliberate session-affinity or MCP gateway
  strategy; the current pool is process-local and fits the local modular
  monolith deployment.
