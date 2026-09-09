# Mnemo

Mnemo is a web BIM workspace for IFC models, large point clouds, BCF collaboration, and AI-assisted model interaction.

This repository is a clean rewrite of the validated prototype. Features are reintroduced incrementally behind explicit domain and rendering boundaries.

## Planned stack

- Next.js, React, TypeScript, and DSFR
- tRPC and Zod
- PostgreSQL and Drizzle ORM
- S3-compatible storage with MinIO locally
- IFC-Lite browser packages and Rust server
- IFC-Lite MCP and OpenRouter
- IFC-Lite WebGPU renderer with native point-cloud overlays

See [`AGENTS.md`](./AGENTS.md) for engineering rules and `docs/adr` for architecture decisions.

## Local development

Prerequisites: Node.js 22+, pnpm 10+, and Docker Compose.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

To run the complete local stack:

```bash
docker compose up --build
```

The default local endpoints are:

- application: <http://localhost:3200>
- health check: <http://localhost:3200/api/health>
- MinIO API: <http://localhost:9200>
- MinIO console: <http://localhost:9201>
- IFC-Lite Rust server: <http://localhost:3301>
- IFC-Lite MCP server: <http://localhost:8765> (bearer token required)
- PostgreSQL: `localhost:5436`

Ports can be changed through the variables documented in [`.env.example`](./.env.example).

The standalone browser parser handles IFC files below 25 MiB by default. Larger files use the IFC-Lite Rust server and progressive Parquet batches. Docker Compose sets the threshold to zero so the server path is exercised for every local IFC; change `IFC_BROWSER_PROCESSING_MAX_BYTES` to test the browser path.

LAS, LAZ, PLY, and E57 point clouds can be attached to a project and overlaid in
the IFC viewer. LAS/LAZ originals are converted asynchronously by
PotreeConverter 2.1.1 into persistent Potree v2 octree artifacts in MinIO. The
browser range-loads only camera-relevant hierarchy and point nodes, decodes
them in a worker, and uploads an additive LOD selection to the same native
IFC-Lite WebGPU renderer as the IFC. The point budget and point size update the
live renderer without recreating it or resetting the camera. PLY/E57 retain a
bounded full-object preview path. Per-file alignment and CRS labels are stored
in PostgreSQL; originals always remain the source of truth.

BCF topics are persisted per project in PostgreSQL. A topic can carry a status,
priority, description, comments, and a durable IFC component reference by
`GlobalId`; when created from the viewer it also keeps the asset and Express ID
needed to focus the element immediately. Viewpoints capture and restore the
IFC-Lite camera, selection, visibility, and coloring; screenshots are uploaded
directly to S3/MinIO and cleaned with their project. The inspector imports and
exports bounded BCF 2.1/3.0 archives through `@ifc-lite/bcf`; imported topic,
comment, and viewpoint GUIDs remain stable, duplicate imports are ignored, and
snapshot binaries are extracted back to MinIO.

The IFC viewer also embeds a streaming assistant built with assistant-ui and AI
SDK v7. It uses OpenRouter with `google/gemini-3.7-flash` by default and keeps
the API key on the Next.js server. Its frontend tool registry can inspect and
query the loaded BIM index, apply one atomic multi-group style, hide or select
elements, frame the camera, and reset the scene. A dedicated
`@ifc-lite/mcp@0.13.1` runtime supplies read-only semantic queries for
properties, quantities, relationships, spatial hierarchy, materials,
georeferencing, and measurements. The first question streams the authorized
MinIO original into a disposable shared cache; later turns reuse a bounded MCP
session. Configure `OPENROUTER_API_KEY` in `.env`; the assistant remains visibly
disabled when the key is absent. Chat persistence is a separate incremental
milestone.

## Repository

```text
apps/
  web/                 Next.js application and HTTP boundary
  processing-worker/   asynchronous processing runtime
packages/
  contracts/           shared Zod and tRPC contracts
  bcf-adapter/         BCF 2.1/3.0 archive interoperability
  database/            Drizzle schema and PostgreSQL adapter
  domain/              framework-independent business rules and ports
  ifc-viewer-adapter/  stable bridge to the IFC-Lite WebGPU runtime
  ifc-mcp-adapter/     safe read-only MCP tool and session boundary
  point-cloud-processing-adapter/ PotreeConverter process boundary
  point-cloud-viewer-adapter/ octree LOD, worker decoding and transforms
  storage/             S3-compatible object-storage adapter
docs/adr/              durable architecture decisions
```

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```
