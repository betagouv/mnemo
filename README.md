# Mnemo

⚠️ Ce projet est en cours de développement. ⚠️

Mnemo is a web BIM workspace for IFC models, large point clouds, BCF collaboration, and AI-assisted model interaction.

This repository is a clean rewrite of the validated prototype. Features are reintroduced incrementally behind explicit domain and rendering boundaries.

## Stack

- Next.js, React, TypeScript, and DSFR
- Next.js Server Actions, focused Route Handlers, and domain Zod schemas
- PostgreSQL and Prisma ORM
- S3-compatible storage with MinIO locally
- IFC-Lite browser packages and Rust server
- IFC-Lite MCP and OpenRouter
- IFC-Lite WebGPU renderer with native point-cloud overlays

See [`AGENTS.md`](./AGENTS.md) for engineering rules and the
[ADR index](./docs/adr/README.md) for architecture decisions and the template.
The first protected Scalingo staging deployment is described in the
[deployment guide](./docs/deployment/scalingo-staging.md).

## Local development

Prerequisites: Node.js 22+, pnpm 10+, and Docker Compose.

```bash
cp .env.local.example .env.local
pnpm install
make dev
```

`make dev` starts PostgreSQL, MinIO, IFC-Lite, IFC MCP, and the processing worker
in Docker, then runs the Next.js web server locally with hot reload at
<http://localhost:3200>. It stops the production `web` container if it was
already running on that port. Press `Ctrl+C` to stop the development web server;
`make stop` stops the supporting containers. A shared local IFC MCP cache lives
under `.data/` so model queries also work in development.
All `make` commands use `.env.local` by default, so the web server and worker
read from the same local MinIO bucket. Values in the selected profile take
precedence over variables already exported in the shell. To develop against an
external S3 bucket:

```bash
cp .env.s3.example .env.s3
# Fill in the bucket, credentials and region in .env.s3.
make dev-s3
```

The external bucket must already exist and allow browser CORS requests from
`http://localhost:3200`. Switching profiles does not migrate files: assets
uploaded to MinIO remain there until explicitly copied to S3. The old `.env`
file is not used by `make`; copy any needed private keys (such as
`OPENROUTER_API_KEY`) into the chosen ignored profile. Restart `make dev` after
changing profiles so Next.js recreates its storage client.

To run the complete local stack:

```bash
make start
```

On a fresh PostgreSQL volume, Compose applies the Prisma baseline before
starting the web application and worker. If this is an existing Mnemo database
created with Drizzle, verify that it matches the Prisma baseline, then mark the
baseline as applied once before starting the new stack:

```bash
DATABASE_URL=postgresql://mnemo:mnemo@localhost:5436/mnemo \
  pnpm --filter @mnemo/database exec prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code
DATABASE_URL=postgresql://mnemo:mnemo@localhost:5436/mnemo \
  pnpm --filter @mnemo/database exec prisma migrate resolve --applied 0_baseline
```

The diff command must report no differences before resolving the baseline.
Do not use `migrate reset` on an existing project database.

Use `make start-detached` to run it in the background and `make help` to list
the other lifecycle commands.

The interactive [LikeC4 architecture model](./docs/architecture/mnemo.c4)
shows the components and the upload, processing, rendering, BCF, and assistant
data flows. It runs independently of the application stack:

```bash
make architecture
make architecture-validate
```

Open <http://localhost:3202>. The `docs` Compose profile keeps the LikeC4
image out of ordinary `make start`. The service builds a static preview on
startup rather than watching the Git worktree; run `make architecture` again
after editing `docs/architecture/*.c4` to regenerate it. The architecture port
can be overridden with `MNEMO_ARCHITECTURE_PORT`.

The default local endpoints are:

- application: <http://localhost:3200>
- health check: <http://localhost:3200/api/health>
- MinIO API: <http://localhost:9200>
- MinIO console: <http://localhost:9201>
- IFC-Lite Rust server: <http://localhost:3301>
- IFC-Lite MCP server: <http://localhost:8765> (bearer token required)
- PostgreSQL: `localhost:5436`

Ports can be changed through the variables documented in
[`.env.local.example`](./.env.local.example). Use `ENV_FILE=.env.s3` with other
`make` commands when operating on the external S3 profile.

The standalone browser parser handles IFC files below 25 MiB by default. Larger files use the IFC-Lite Rust server and progressive Parquet batches. Docker Compose sets the threshold to zero so the server path is exercised for every local IFC; change `IFC_BROWSER_PROCESSING_MAX_BYTES` to test the browser path.

A project opens as one scene at `/projets/[projectId]/viewer`: all ready IFC
models and point clouds are loaded into the same IFC-Lite WebGPU renderer. The
DSFR BIM and Relevé 3D panels control layers per file. BIM visibility can be
set to visible, translucent, or hidden at model, storey, class, and element
level; point clouds have independent visibility, LOD budget, point size, and
persisted alignment. React owns the panels and access/retry flow, while a
long-lived viewer controller owns the renderer, camera, selection, and GPU
resources. UI changes do not recreate the scene or reset the camera.

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
disabled when the key is absent. Conversations are persisted per user, project,
and IFC asset in PostgreSQL. They can be created, reopened, and deleted from
the inspector; the complete AI SDK message payload is saved after each streamed
turn so text, model metadata, and tool traces survive a page reload.

## Repository

```text
apps/
  web/                 Next.js application and HTTP boundary
  processing-worker/   asynchronous processing runtime
packages/
  contracts/           shared domain schemas and DTOs
  bcf-adapter/         BCF 2.1/3.0 archive interoperability
  database/            Prisma schema and PostgreSQL adapter
  domain/              framework-independent business rules and ports
  ifc-viewer-adapter/  stable bridge to the IFC-Lite WebGPU runtime
  point-cloud-viewer-adapter/ octree LOD, worker decoding and transforms
  storage/             S3-compatible object-storage adapter
apps/web/src/server/assistant/infrastructure/  IFC-Lite MCP sessions
apps/processing-worker/src/infrastructure/     IFC-Lite and Potree processors
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

To run the browser suite against an existing `make dev` server without starting
another Next.js process: `PLAYWRIGHT_BASE_URL=http://localhost:3200 pnpm test:e2e`.
