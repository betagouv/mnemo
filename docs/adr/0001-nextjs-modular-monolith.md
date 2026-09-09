# ADR 0001: Use Next.js as a modular monolith

- Status: accepted
- Date: 2026-09-09

## Context

Mnemo needs a public static site, authenticated application pages later, a type-safe application API, assistant streaming, and a browser BIM viewer. A separate general-purpose HTTP framework would duplicate deployment and transport concerns before the domain needs an independently scaled API.

## Decision

Use the Next.js App Router for the web application and its HTTP boundary. Keep application logic independent from Next.js through use cases and ports. Use tRPC for first-party JSON operations and dedicated route handlers for protocol-specific traffic such as uploads, assistant streams, authentication callbacks, and health checks.

Long-running work is never performed in an HTTP request. It runs in the processing worker. The IFC-Lite Rust and MCP servers remain dedicated runtimes behind application-owned adapters.

## Consequences

- One deployable web runtime serves pages and the ordinary API.
- Server Components invoke application services directly rather than calling the local HTTP API.
- A future standalone API remains possible because transports do not own domain logic.
- Worker and IFC processing availability do not determine the web framework.
