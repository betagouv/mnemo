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
- IFC-Lite WebGPU renderer with streamed point-cloud LOD

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
- PostgreSQL: `localhost:5436`

Ports can be changed through the variables documented in [`.env.example`](./.env.example).

## Repository

```text
apps/
  web/                 Next.js application and HTTP boundary
  processing-worker/   asynchronous processing runtime
packages/
  contracts/           shared Zod and tRPC contracts
  database/            Drizzle schema and PostgreSQL adapter
  domain/              framework-independent business rules and ports
  ifc-viewer-adapter/  stable bridge to the IFC-Lite WebGPU runtime
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
