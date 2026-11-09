# ADR 0019 — Consume the IFC-Lite footprint optimization from a fork

- Status accepted
- Date 2026-11-09

## Decision

Consume a patched WASM 10.4.0 package from `boehm-e/ifc-lite`. Its footprint
calculation uses i_overlay's i64 union and the bounded LIST/AUTO solver policy.
The fork owns the Rust changes, regression test and package build.

A public GitHub Release distributes the prebuilt npm archive. A workspace-wide
pnpm override selects that archive for direct and transitive WASM consumers.
The lockfile records the archive's integrity. Application builds use the
precompiled dependency through the existing IFC-Lite API.

Mnemo owns storey-band selection, worker cancellation, input validation and
placement adaptation. IFC-Lite owns projection, section cutting, clipping,
visibility and line merging. The fork can be replaced by a validated official
release containing an equivalent optimization.
