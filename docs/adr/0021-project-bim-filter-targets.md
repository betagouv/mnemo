# Project-scoped BIM filters with explicit model targets

- Status: Accepted
- Date: 2026-11-13

## Context

A project can combine several IFC models. Per-asset filter documents prevent a
single group from targeting several models and tie filter activation to the
explorer's active model. Storey express IDs can collide between IFC files.

## Decision

Persist one versioned JSON document per project in `project_bim_filters`.
Each group holds explicit IFC asset IDs. Storey criteria contain both the asset
ID and the storey express ID. Resolve each rule against its target models and
compose their federated IDs in one visual plan. Active-model selection remains
independent of that plan.

Migrate existing groups into the project document with their original asset as
target. Regenerate group and rule UUIDs to avoid collisions between documents.
Use the most recently updated source document's context preferences. Remove the
per-asset table after migration.

Saving requires `project:update`. Validate that every target is a ready IFC in
the same project. Use optimistic versions and serialize saves with asset deletion
on the project row. Asset deletion removes its references and disables groups
or rules whose targets or criteria become empty, retaining their definitions.

## Consequences

Groups can overlap, accumulate effects and be saved together. Isolating objects
in a targeted model preserves other models. Loading additional models refreshes
the visual plan while retaining temporary selection isolation. Shared context
preferences apply across the project, so conflicting old per-model preferences
are consolidated during migration.
