# ADR 0011 — Assistant runtime and viewer tools

- Status: Accepted
- Date: 2026-09-09

## Context

Mnemo needs a chat interface that can both answer about an IFC model and act on
the existing WebGPU scene. The OpenRouter credential must stay server-side, the
viewer must not be recreated by a chat state change, and adding an action must
not require changes to the model streaming loop. IFC-Lite MCP will later add a
large server-side BIM tool surface, while scene commands necessarily execute in
the browser that owns the renderer.

## Decision

Use assistant-ui with AI SDK v7 in the viewer inspector. A dedicated Next.js
route handler streams responses from OpenRouter and defaults to
`google/gemini-3.7-flash`. The route validates a bounded request, authorizes the
project asset, and converts only validated assistant-ui frontend tool schemas.
The OpenRouter key is read only on the server.

Scene operations are frontend tools behind application-owned schemas and a
small `ViewerToolActions` interface. Their executors obtain the already-mounted
`IfcViewerController`; they never create a renderer. One `set_scene_style`
command supports several filtered color groups so a compound instruction is
applied atomically. Isolation delegates context visibility and opacity to the
current UI setting and exposes no opacity parameter to the model.

The assistant is kept mounted when the inspector tab changes so local
conversation state is not lost. Durable threads and messages will be added in a
separate database slice. The IFC-Lite MCP runtime and adapter remain a separate
runtime milestone rather than being embedded into this HTTP handler.

## Consequences

- A new viewer action is added by defining a Zod schema and one tool registry
  entry around a controller command.
- The chat route is protocol-specific and remains outside tRPC; normal JSON
  application operations continue to use tRPC.
- A missing OpenRouter key disables the composer explicitly instead of failing
  after the user sends a message.
- Model answers render GitHub-flavoured Markdown through
  `@assistant-ui/react-markdown`.
- Server-side IFC queries are intentionally deferred to the IFC-Lite MCP
  adapter; this slice only reads the BIM index already loaded in the browser.
