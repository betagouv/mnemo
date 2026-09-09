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

