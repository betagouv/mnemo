# ADR 0002: Combine feature slices with clean server boundaries

- Status: accepted
- Date: 2026-09-09

## Context

The prototype accumulated UI, rendering, persistence, and integration concerns in large components. A strict textbook architecture would add excessive ceremony, while an unstructured feature folder would allow the same coupling to return.

## Decision

Adapt Feature-Sliced Design in `apps/web/src` using this dependency direction:

```text
app -> screens -> widgets -> features -> entities -> shared
```

Each slice exposes a small public API. Next.js route modules compose screens and remain thin.

On the server, use this flow:

```text
transport -> application use case -> port -> infrastructure adapter
```

Framework-free domain types and invariants live in `packages/domain`. Runtime input and transport contracts live in `packages/contracts`. Infrastructure packages implement application-owned ports.

Do not create empty layers. Add each folder only with the first real slice that uses it.

## Consequences

- Browser dependencies cannot leak into server or domain code.
- Vendor libraries stay replaceable behind focused adapters.
- Architecture rules can be checked mechanically.
- A small feature may remain local until reuse justifies a package.

