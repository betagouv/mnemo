# Architecture decision records

This directory records **why** Mnemo made significant technical choices. The
current architecture is described in [LikeC4](../architecture/mnemo.c4); an ADR
explains the context, alternatives, trade-offs, and consequences of one decision.
It is not a feature specification or a copy of the implementation.

## When to write an ADR

Write one when a choice changes a durable boundary, data ownership, deployment
model, security posture, foundational dependency, or an important performance
constraint. Do not write one for a local refactor or a reversible UI detail.

Create the ADR **before or alongside** the implementing branch when possible.
Describe an unapproved option as `proposed`, not `accepted`. Keep operational
instructions in the README or runbooks, and never include credentials.

## How to write one

1. Copy [the template](TEMPLATE.md) to the next available
   `NNNN-short-kebab-case-title.md`. Never reuse a number.
2. State the concrete problem and constraints, the options considered, the
   decision, and its positive **and negative** consequences. Link evidence or
   benchmarks when they matter; keep the record concise.
3. Open the ADR for review with the related change. Involve the people responsible
   for the affected system or risk. Mark it `accepted` only after the decision
   has been made; an accepted ADR does not imply that implementation is complete.
4. If the decision changes, write a **new** ADR and mark the old one
   `superseded by ADR NNNN`, linking both records. Do not erase the history.

Statuses: `proposed`, `accepted`, `rejected`, or `superseded by ADR NNNN`.
Existing records with older formatting remain valid; use the template for new
ones. The index below includes every numbered ADR and should be updated in the
same change as a new record.

## Decision index

| ADR                                                 | Decision                                   | Status                                                            |
| --------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| [0001](0001-nextjs-modular-monolith.md)             | Next.js modular monolith                   | Accepted                                                          |
| [0002](0002-code-boundaries.md)                     | Feature slices and clean server boundaries | Accepted                                                          |
| [0003](0003-file-and-processing-ownership.md)       | File ownership and processing caches       | Accepted                                                          |
| [0004](0004-viewer-runtime.md)                      | Stable WebGPU viewer runtime               | Accepted                                                          |
| [0005](0005-type-safe-api.md)                       | tRPC and Zod API                           | Superseded by [0014](0014-nextjs-zod-prisma.md)                   |
| [0006](0006-persistent-processing-leases.md)        | Persistent processing leases               | Superseded by [0015](0015-s3-native-ifc-and-oneoff-processing.md) |
| [0007](0007-ifc-lite-webpack-integration.md)        | IFC-Lite and Webpack                       | Accepted                                                          |
| [0008](0008-ifc-lite-server-distribution.md)        | IFC-Lite Rust binary distribution          | Superseded by [0015](0015-s3-native-ifc-and-oneoff-processing.md) |
| [0009](0009-point-cloud-ingestion-and-rendering.md) | Point-cloud ingestion and rendering        | Superseded by [0016](0016-copc-only-point-clouds.md)              |
| [0010](0010-bcf-persistence.md)                     | BCF persistence and interoperability       | Accepted                                                          |
| [0011](0011-assistant-runtime-and-viewer-tools.md)  | Assistant runtime and viewer tools         | Accepted                                                          |
| [0012](0012-ifc-lite-mcp-runtime.md)                | Dedicated IFC-Lite MCP runtime             | Accepted                                                          |
| [0013](0013-persistent-assistant-threads.md)        | Persistent assistant threads               | Accepted                                                          |
| [0014](0014-nextjs-zod-prisma.md)                   | Native Next.js boundaries and Prisma       | Accepted                                                          |
| [0015](0015-s3-native-ifc-and-oneoff-processing.md) | S3-native IFC and on-demand conversion     | Accepted; COPC format in [0016](0016-copc-only-point-clouds.md)   |
| [0016](0016-copc-only-point-clouds.md)              | COPC-only tiled point clouds               | Accepted                                                          |
