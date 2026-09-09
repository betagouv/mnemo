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
- PostgreSQL: `localhost:5436`

Ports can be changed through the variables documented in [`.env.example`](./.env.example).

The standalone browser parser handles IFC files below 25 MiB by default. Larger files use the IFC-Lite Rust server and progressive Parquet batches. Docker Compose sets the threshold to zero so the server path is exercised for every local IFC; change `IFC_BROWSER_PROCESSING_MAX_BYTES` to test the browser path.

LAS, LAZ, PLY, and E57 point clouds can be attached to a project and overlaid in the IFC viewer. The current browser preview decodes in a worker, limits the number of uploaded points through sampling, and keeps alignment in PostgreSQL. It still downloads the complete original object before decoding; true camera-driven octree/LOD streaming for very large scans is the next point-cloud milestone.

BCF topics are persisted per project in PostgreSQL. A topic can carry a status,
priority, description, comments, and a durable IFC component reference by
`GlobalId`; when created from the viewer it also keeps the asset and Express ID
needed to focus the element immediately. Viewpoints capture and restore the
IFC-Lite camera, selection, visibility, and coloring; screenshots are uploaded
directly to S3/MinIO and cleaned with their project. The inspector imports and
exports bounded BCF 2.1/3.0 archives through `@ifc-lite/bcf`; imported topic,
comment, and viewpoint GUIDs remain stable, duplicate imports are ignored, and
snapshot binaries are extracted back to MinIO.

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
  point-cloud-viewer-adapter/ worker decoding and transform boundary
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
