# ADR 0014: Native Next.js boundaries and Prisma persistence

- Status: accepted
- Date: 2026-10-05

## Context

Mnemo's web application and first-party API already share one Next.js deployment. A generic JSON RPC dispatcher would recreate a transport framework inside Next.js. PostgreSQL contains existing project and asset data created through Drizzle, which must survive the ORM switch.

## Decision

Use Server Components for initial reads and directly invoke application services. Use named Server Actions for first-party mutations; each action validates its input with its domain Zod schema and authorizes through the application service. Use explicit GET Route Handlers for browser-driven reads, with domain Zod validation at both HTTP ends. Keep streaming assistant and BCF archive routes as dedicated protocol endpoints. Do not maintain a generic operation registry, RPC dispatcher, or client-wide query provider.

Use Prisma ORM for PostgreSQL repositories and future schema migrations. The existing database is introspected and baselined rather than recreated. New installations apply the Prisma baseline migration; existing installations mark it applied before running `prisma migrate deploy`. Keep the IFC-Lite Rust server and the processing worker separate from request handling. The job queues use parameterized Prisma raw SQL for atomic `FOR UPDATE SKIP LOCKED` claims and lease fencing.

## Consequences

- Next.js is the only application HTTP backend; processing services remain independent runtimes.
- Server Actions share TypeScript signatures with their client callers; the focused GET routes share domain Zod response schemas.
- PostgreSQL data and MinIO objects are not reset during the ORM migration.
- Every browser-driven HTTP endpoint has an explicit path and method.
