# ADR 0005: Share runtime contracts through tRPC and Zod

- Status: superseded by ADR 0014
- Date: 2026-09-09

## Context

The browser, Server Components, workers, and later external processing adapters need consistent data shapes. Maintaining handwritten request interfaces separately from runtime validation would allow the API and client to drift.

## Decision

Use Zod schemas from `@mnemo/contracts` as the canonical runtime contracts and infer their TypeScript types. Use tRPC 11 for first-party JSON procedures. Client code imports the `AppRouter` with `import type`, so procedure inputs and outputs flow end to end without generated clients or runtime server imports.

Next.js route handlers expose tRPC through its Fetch adapter. Server Components call server application services or a server caller directly rather than making HTTP requests to the same process. Protocol-specific endpoints remain ordinary route handlers.

## Consequences

- A contract change fails at the producer and all typed consumers during development.
- External integrations can consume the same Zod schema without depending on React or Next.js.
- tRPC is a transport boundary, not a location for persistence or business rules.
- Public third-party APIs may still need OpenAPI or another stable external contract later.
