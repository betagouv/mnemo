# Mnemo engineering rules

These instructions apply to the whole repository.

## Product and architecture

- Mnemo is a web BIM workspace for IFC models, large point clouds, BCF topics, and an AI assistant.
- Keep original user files in S3-compatible object storage. IFC-Lite servers and local MCP model copies are disposable processing caches, never permanent storage.
- Use a modular monolith. The application runtimes are Next.js, the IFC-Lite Rust service, and the IFC MCP service. Next.js orchestrates durable conversion and deletion queues outside HTTP request lifecycles when `MNEMO_BACKGROUND_JOBS=1`. Point-cloud conversions run in disposable local processes/containers or Scalingo one-offs, not a permanent worker service (ADR 0015).
- Prefer explicit domain boundaries and small vertical slices over framework-level abstractions.
- Do not reproduce functionality already provided by current IFC-Lite packages. Verify the current documentation and installed TypeScript declarations before integrating an IFC-Lite API.
- For implementation examples, coding agents may inspect the sibling `../ifc-lite/apps/viewer/` application, especially its viewer components. Treat it as a reference, not an API contract: verify Mnemo's installed IFC-Lite types and adapt the behavior rather than copying code blindly.

## Repository layout

- `apps/web`: Next.js application, including UI, server components, and typed route handlers.
- `apps/processing-worker`: durable background job orchestration imported by Next.js, plus one-off point-cloud conversion entry points executed outside HTTP request lifecycles.
- `packages/domain`: framework-free domain types and invariants.
- `packages/contracts`: shared Zod schemas, DTOs, and event contracts.
- `packages/database`: Prisma schema, migrations, and PostgreSQL client.
- `packages/storage`: object-storage ports and S3/MinIO adapters.
- `packages/*-adapter`: shared vendor-specific integrations behind application-owned interfaces. Keep single-consumer adapters in the consuming app's `infrastructure` folder.
- `infra`: local MinIO bootstrap configuration.
- `infrastructure`: IFC/MCP container runtimes and Scalingo deployment wrappers.
- `apps/web/src/server`: server application services, ports, infrastructure adapters, authentication, and Server Actions. Keep browser-only dependencies out of this tree.
- `docs/architecture`: the LikeC4 architecture model, available through `make architecture`.
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
- Slices expose a public API from `index.ts`; do not deep-import another slice. Compose sibling slices in a higher layer, including when importing through public indexes.
- Client modules access server code through Server Actions. Put public DTOs in `packages/contracts`, keeping repository ports server-side.
- Architecture checks resolve both aliases and relative imports, follow client dependencies, and verify application-to-infrastructure boundaries.
- Do not create empty layers or placeholder folders before a real slice needs them.

## Feature ownership and reading order

- Start at the route in `app`, then its `screens` composition and the relevant feature's `index.ts`.
- Inside a feature, `ui` owns presentation, `model` owns state and calculations, `api` owns browser transport, and `infrastructure` owns single-consumer technical integrations. Create only the segments that are needed.

| Feature under `apps/web/src/features` | Scope                                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view-floor-plans`                    | Storey selection, plan generation, canvas navigation, snapping, measurements, presets, custom rules, saved views and PDF export. PDF code and jsPDF belong in this feature's `infrastructure/pdf`. |
| `manage-bcf-topics`                   | Topic list/detail/editing, comments, archive exchange, viewpoint uploads and scene markers. `use-bcf-workspace` owns workspace state; `use-bcf-viewer` owns scene integration.                     |
| `explore-bim-model`                   | Model visibility and BIM trees by class/storey, including expansion to reveal scene selections.                                                                                                    |
| `configure-point-cloud`               | Point-cloud loading, access renewal, point budgets, visibility, transforms and rendering settings.                                                                                                 |
| `measure-scene`                       | 3D distance and planar-area measurements, magnetic picking, draft state and scene overlays. Pointer updates stay inside the feature provider.                                                      |
| `control-section`                     | Plane/box controls, scene picking, gizmos and their geometry calculations.                                                                                                                         |
| `interact-with-ifc-assistant`         | Conversation UI, frontend tool schemas and translation of tool calls into viewer commands.                                                                                                         |
| `manage-users`                        | Global account approval and administrator/user roles. Administrative actions are distinct from permissions on individual projects.                                                                 |
| `manage-project-access`               | Member access, pending invitations, custom roles and permission editors.                                                                                                                           |
| `manage-project-metadata`             | Project metadata editing.                                                                                                                                                                          |
| `upload-asset`                        | File selection/drop, direct object-storage transfer and upload completion.                                                                                                                         |
| `delete-asset`, `delete-project`      | User confirmation and server deletion commands. Durable cleanup belongs to server jobs.                                                                                                            |

- `widgets/ifc-viewer` composes features. `use-project-scene` owns controller setup/disposal and IFC loading; `use-viewer-panels` owns panel navigation and focus. Keep feature-specific state inside its owning feature.
- `entities/viewer` exposes shared IFC/point-cloud source DTOs. `entities/bcf` exposes BCF presentation helpers and the shared workspace read API.
- `entities/measurement` owns the shared saved-measurement store. `features/manage-measurements` owns save, rename and delete controls, composed into the 3D and plan features by the viewer widget. `server/measurements` enforces project permissions and optimistic versions. Persist points as absolute IFC Z-up metres, converting renderer origins at the adapter boundary. Plan measurements belong to saved views and cascade with them.
- Features consume narrow viewer contracts from their own `model/viewer-target.ts`. Keep renderer/camera/GPU ownership in `packages/ifc-viewer-adapter`; its controller delegates BCF viewpoint operations to `bcf-viewpoints.ts` and plan generation to `floor-plan-generator.ts`.
- Floor-plan generation runs in a cancellable worker. Select meshes from the storey floor to the cut at +1.20 m using their world-space vertical extent and per-mesh origins; retain elements crossing storeys. Transfer disposable buffer copies so the 3D scene stays intact. Keep the per-viewer drawing cache bounded and clear it when IFC geometry reloads or the viewer is disposed.
- Floor-plan projection uses the public IFC-Lite WASM footprint extractor, with local-space extraction and double-precision placement. Use IFC-Lite's generator with projection-band clipping for visibility and merging. Treat footprint budget failures as a failed generation with an explicit user alert, never a silently incomplete plan. Avoid accumulating triangle silhouette edges for the whole building.
- The workspace pnpm override pins the IFC-Lite WASM footprint optimization to a public release of `boehm-e/ifc-lite` (ADR 0019). Keep the Rust source and package build in that fork. Validate plan contours and browser worker loading when replacing the pinned artifact.
- Floor-plan navigation reuses bounded overview/detail raster snapshots during pan and wheel gestures, then redraws vectors at native display density on release or wheel idle. Keep exact navigation and snapping coordinates independent from raster resolution. Release snapshots on style changes, resize and disposal.
- Floor-plan rendering and snapping share the feature's spatial index. Cache prepared paths by drawing identity, cull only geometry outside the viewport, and preserve style draw order and full-resolution export geometry.
- Saved plans persist their source asset, storey, name, style and version in PostgreSQL. Regenerate drawing geometry from the loaded IFC. Honor optimistic version checks on updates and deletion.
- When moving a responsibility, migrate all callers and remove the old module and exports. Keep a single active implementation; add compatibility behavior only for an explicit product requirement.

## Frontend styling

- Use DSFR components for controls and established design patterns.
- For DSFR component work, consult the repository skill at `.agents/skills/react-dsfr/SKILL.md`; adapt its examples to Mnemo's installed package version and the styling rules below.
- Use Tailwind utilities for application layout: grid/flex composition, sizing, spacing, positioning, and responsive behavior. Keep component-specific rendering, DSFR overrides, and 3D controls in scoped CSS when clearer.
- Use DSFR semantic color tokens for surfaces, text, borders, and interaction states. Verify affected UI in both light and dark themes, including overlays and viewer controls.
- Tailwind Preflight is disabled to avoid resetting DSFR. Do not add a second global reset or duplicate layout rules in utilities and CSS modules.

## Server boundaries

- Route handlers are transport adapters. They must not contain SQL, S3 calls, or substantial business rules.
- Server flow is `transport -> application use case -> port -> infrastructure adapter`.
- Each server domain lives under `apps/web/src/server/<domain>`. Keep use cases and ports in `application`, concrete adapters in `infrastructure`, and dependency wiring in domain factories. Application modules must depend on ports rather than concrete infrastructure.
- BCF archive import/export lives in `server/bcf/application/bcf-archives.ts`; snapshot storage helpers live alongside it. Assistant session orchestration lives in `server/assistant/application/start-assistant-session.ts`, with runtime wiring in `assistant-session-factory.ts`.
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
- Public registration uses Better Auth email/password with mandatory email verification. Brevo sends verification, password-reset, and invitation emails through the server-only SDK integration. Password reset revokes existing sessions.
- Pending project invitations grant no access until accepted by a signed-in account with the matching verified email. Keep invitation tokens hashed, expiring, and revocable.
- Authenticate users with Better Auth email/password sessions. There is no development actor or alternate authentication mode.
- New accounts need email verification and administrator approval before workspace or asset access. Global `user`/`admin` roles are read live from PostgreSQL. Account administration lives in `server/accounts`; atomic role changes preserve at least one approved, verified administrator. Global administrators receive no implicit project permissions.
- Authentication identifies the actor. Project permissions authorize each operation. Enforce authorization in server use cases, not only in pages or components.
- Generate storage object keys on the server. Never trust a client-provided object key or prefix.
- Deletion workflows must be idempotent and clean database records, original objects, derived artifacts, caches, and working copies.

## Code quality

- TypeScript runs in strict mode. Avoid `any`; narrow `unknown` at boundaries.
- Prefer named domain types and discriminated unions for lifecycle states.
- Keep modules focused. Do not recreate an application-wide `App.tsx` orchestration component.
- Keep secrets server-only. Public environment variables must use the `NEXT_PUBLIC_` prefix deliberately.
- For security-sensitive development, consult `.agents/skills/securite-developpement/SKILL.md` and its relevant references.
- Do not commit `.env` files, credentials, generated uploads, database volumes, or model files.
- Add an ADR when changing a durable architecture boundary or selecting a foundational vendor. Follow the [ADR guide](docs/adr/README.md) and its template.

## Local development

- Use `make dev` for Next.js hot reload with supporting Docker services. `ENV_FILE` defaults to `.env.local`; select another profile explicitly, for example `make dev ENV_FILE=.env.s3`.
- Use `make db-studio` to open Prisma Studio with the selected environment profile.
- Use `make test-e2e` for visible browser tests against the running development server. Run targeted Playwright files for affected workflows; load the same environment profile with `scripts/with-env-profile.mjs`.
- The root package declares the supported Node.js and pnpm versions. Keep local tooling aligned with `package.json` and CI.

## Tests and validation

Every branch must pass the relevant subset of:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
docker compose --env-file .env.local.example config
```

- `pnpm lint` includes `pnpm lint:architecture`. The checker in `scripts/architecture-boundaries.mjs` resolves local imports/re-exports, rejects cross-slice private imports and sibling dependencies, follows client runtime imports, and checks server application/infrastructure boundaries. Its regression tests run through `pnpm test`.
- Add unit tests for domain rules and viewer commands.
- Add integration tests for PostgreSQL, MinIO, workers, and destructive cleanup.
- Add targeted Playwright tests for important user-visible workflows. Use representative real fixtures and observable readiness conditions rather than fixed sleeps. CI runs the full browser suite against a production build.
- Use `make config` to validate Compose with the selected local environment profile. The example profile above is the CI configuration check.
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
- Open a pull request from the feature branch to `main`; do not push feature work directly to `main`.
- Merge only after the acceptance criteria and required CI checks pass. Keep the PR open if validation fails, and fix the branch before merging.
