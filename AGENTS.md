# Mnemo engineering rules

These instructions apply to the whole repository.

## Product and architecture

- Mnemo is a web BIM workspace for IFC models, large point clouds, BCF topics, and an AI assistant.
- Keep original user files in S3-compatible object storage. IFC-Lite servers and local MCP model copies are disposable processing caches, never permanent storage.
- Use a modular monolith. The only separate runtimes are the Next.js application, background processing workers, IFC-Lite Rust server, and IFC MCP server.
- Prefer explicit domain boundaries and small vertical slices over framework-level abstractions.
- Do not reproduce functionality already provided by current IFC-Lite packages. Verify the current documentation and installed TypeScript declarations before integrating an IFC-Lite API.
- For implementation examples, coding agents may inspect the sibling `../ifc-lite/apps/viewer/` application, especially its viewer components. Treat it as a reference, not an API contract: verify Mnemo's installed IFC-Lite types and adapt the behavior rather than copying code blindly.

## Repository layout

- `apps/web`: Next.js application, including UI, server components, and typed route handlers.
- `apps/processing-worker`: asynchronous jobs that must not run in an HTTP request lifecycle.
- `packages/domain`: framework-free domain types and invariants.
- `packages/contracts`: shared Zod schemas, DTOs, and event contracts.
- `packages/database`: Prisma schema, migrations, and PostgreSQL client.
- `packages/storage`: object-storage ports and S3/MinIO adapters.
- `packages/*-adapter`: shared vendor-specific integrations behind application-owned interfaces. Keep single-consumer adapters in the consuming app's `infrastructure` folder.
- `infra`: local infrastructure and container configuration.
- `docs/adr`: durable architecture decisions.

## Frontend boundaries

Use a Feature-Sliced Design adaptation under `apps/web/src`:

```text
app -> screens -> widgets -> features -> entities -> shared
```

- `app` contains Next.js routes, layouts, providers, and global composition only.
- `screens` contains route-level page composition. Next.js route files should remain thin.
- `widgets` contains complete UI regions.
- `features` contains user actions.
- `entities` contains application business concepts.
- `shared` contains domain-independent primitives.
- A layer may import only layers to its right in the dependency rule above.
- Slices expose a public API from `index.ts`; do not deep-import another slice.
- Do not create empty layers or placeholder folders before a real slice needs them.

## Frontend styling

- Use DSFR components for controls and established design patterns.
- Use Tailwind utilities for application layout: grid/flex composition, sizing, spacing, positioning, and responsive behavior. Keep component-specific rendering, DSFR overrides, and 3D controls in scoped CSS when clearer.
- Tailwind Preflight is disabled to avoid resetting DSFR. Do not add a second global reset or duplicate layout rules in utilities and CSS modules.

## Server boundaries

- Route handlers are transport adapters. They must not contain SQL, S3 calls, or substantial business rules.
- Server flow is `transport -> application use case -> port -> infrastructure adapter`.
- Validate every external input at runtime with Zod even when TypeScript types are shared.
- Use Server Components for initial reads and Server Actions for first-party mutations. Keep explicit Route Handlers for browser-driven reads, streaming, archives, authentication callbacks, and byte-range delivery when needed. Do not add a catch-all RPC dispatcher.
- Server Components call server application services directly; they must not fetch the application's own HTTP API.
- Large uploads go directly from the browser to S3/MinIO through short-lived presigned URLs.
- Long-running conversion, deletion, and processing work belongs in an idempotent background job.
- Prisma owns schema evolution. Preserve the baselined PostgreSQL schema and data; use parameterized Prisma raw SQL only for database features the model API cannot express, such as atomic `SKIP LOCKED` job claims.

## Viewer boundaries

- IFC-Lite WebGPU owns the main rendering canvas.
- React owns interface state, not GPU objects.
- A `ViewerController` owns renderer, camera, model layers, point-cloud layers, and GPU resource lifetime.
- Create the renderer once when the viewer mounts and dispose it once when it unmounts.
- React state changes must issue commands to the existing controller and must not recreate or reframe the scene.
- Initial framing happens only for an explicit load or user action.
- Point clouds must use LOD, octrees, streaming, and a point budget. Never load a large dataset naively into RAM/GPU.
- Store layer transforms in PostgreSQL; store COPC point-cloud artifacts in S3/MinIO.

## Data and access

- PostgreSQL is the source of truth for projects, memberships, assets, scene state, jobs, BCF metadata, and chat metadata.
- Object storage is the source of truth for original files and derived binary artifacts.
- Project access is many-to-many through `project_members`; do not put a single owner foreign key in place of membership authorization.
- Until authentication is implemented, resolve a seeded development actor through an application port. Production configuration must reject development authentication mode.
- Authentication identifies the actor. Project permissions authorize each operation. Enforce authorization in server use cases, not only in pages or components.
- Generate storage object keys on the server. Never trust a client-provided object key or prefix.
- Deletion workflows must be idempotent and clean database records, original objects, derived artifacts, caches, and working copies.

## Code quality

- TypeScript runs in strict mode. Avoid `any`; narrow `unknown` at boundaries.
- Prefer named domain types and discriminated unions for lifecycle states.
- Keep modules focused. Do not recreate an application-wide `App.tsx` orchestration component.
- Keep secrets server-only. Public environment variables must use the `NEXT_PUBLIC_` prefix deliberately.
- Do not commit `.env` files, credentials, generated uploads, database volumes, or model files.
- Add an ADR when changing a durable architecture boundary or selecting a foundational vendor. Follow the [ADR guide](docs/adr/README.md) and its template.

## Tests and validation

Every branch must pass the relevant subset of:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```

- Add unit tests for domain rules and viewer commands.
- Add integration tests for PostgreSQL, MinIO, workers, and destructive cleanup.
- Add Playwright tests for user-visible workflows.
- Viewer work is not complete after a build alone. Validate it with the repository's real IFC and point-cloud fixtures.
- Test explicitly that ordinary React state changes do not recreate the renderer, reset the camera, or duplicate point-cloud nodes.

## Git workflow

- `main` must remain runnable and green.
- Create one short-lived branch per coherent feature or infrastructure slice.
- Use branch prefixes such as `feat/`, `fix/`, `chore/`, `test/`, `docs/`, and `spike/`.
- Rebase or merge the latest local `main` before final validation when necessary.
- Use Gitmoji at the start of every commit subject, followed by an imperative English description.
- Examples: `🎉 Initialize Mnemo repository`, `🏗️ Add typed API boundary`, `✨ Add project creation flow`, `✅ Test project permissions`.
- Do not mix unrelated cleanup with a feature branch.
- Do not merge a branch until its acceptance criteria are verified.
