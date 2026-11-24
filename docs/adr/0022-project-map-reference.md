# ADR 0022: Persistent project frame for federated IFC models

- Status: proposed
- Date: 2026-11-24

## Context

IFC files of one project describe their position with different map conversions,
coordinate reference systems, units and local origins. Mnemo displayed each file in
its authored coordinates, so georeferenced models did not overlap. Measurements and
BCF viewpoints persist absolute coordinates: the frame in which they are expressed
must not depend on load order or on a file being available.

IFC vertices are `f32`. At Lambert-93 coordinates, one `f32` step is 0.5 m.

## Options considered

- **Map coordinates of a project CRS:** independent of any model, but rotates every
  plan and section to grid north and exports BCF viewpoints that other BIM tools,
  which use IFC engineering coordinates, cannot read.
- **First loaded model:** no persistence, but a failed load or a new upload moves
  saved coordinates.
- **Persisted engineering frame of the first georeferenced model:** single-model
  projects keep their coordinates, and saved data stays in place.

## Decision

Use the third option. `project_map_references` stores the map conversion, in metres,
of the first georeferenced model. The browser submits it once; the first insert wins
and every session uses the retained value. Readers never define it. Models load
oldest first. Deleting the reference model drops the frame only when the project has
no measurement and no BCF viewpoint.

IFC-Lite provides georeference extraction, spatial placement and RTC offsets.
`@ifc-lite/geo` provides the EPSG registry, projections, grid convergence and scale.
A conversion in another CRS is re-expressed in the project CRS around the model
centre, which keeps the placement affine. The adapter applies it to each mesh's `f64`
origin and rotates vertices around that origin.

Models without a usable projection keep their authored coordinates and the interface
reports it. Heights are never converted; declared vertical datums that differ are
reported. No network loader is configured: datums that need a grid use IFC-Lite's
published Helmert parameters and are reported as approximate.

## Consequences

- **Benefits:** load-order independence, f32 precision at map coordinates, one
  placement path for the browser and Rust engines.
- **Costs and risks:** models other than the first are buffered until their
  georeference and RTC are complete, so they appear at once. Scale follows the
  declared conversions: a file whose `Scale` ignores the grid factor is resized by
  that factor (0.03 % to 0.1 %) when it is aligned with another CRS. The EPSG index
  (4.6 MB) loads lazily when a frame is first defined or two CRS differ. Coordinates
  saved earlier on a model that was misplaced cannot be corrected. Point-cloud
  transforms are saved relative to the scene origin: a cloud aligned by hand in a
  project of several IFC files may need realigning once, because the oldest model now
  sets that origin and the others move.
- **Follow-up:** `IfcRigidOperation`, `IfcGeographicCRS` and vertical grids depend on
  IFC-Lite. A placement event before geometry in IFC-Lite Rust would restore
  progressive display for every model.

## Validation and review

`federation-fixtures.test.ts` aligns Lambert-93, CC49, UTM 31N, rotated and absolute
descriptions of one wall within 0.5 mm, in any load order. Browser tests cover
warnings and recovery from a failed load.

## References

- [Issue 15](https://github.com/betagouv/mnemo/issues/15)
