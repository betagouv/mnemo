# ADR 0009 — Point-cloud ingestion and rendering

## Status

Superseded by [ADR 0016](0016-copc-only-point-clouds.md) for LAS/LAZ conversion and LOD transport.

## Context

The IFC model and scan must share one depth buffer, camera and WebGPU render
loop. `@ifc-lite/pointcloud@0.7.2` decodes LAS, LAZ, PLY and E57 in chunks and
`@ifc-lite/renderer@2.0.1` uploads those chunks through its native point-cloud
pipeline. The decoder's `maxPointsInMemory` option applies stride sampling, but
it is not a camera-driven octree and a remote object must currently be fetched
as a browser `Blob` before decoding.

Potree's viewer and `potree-core` own a Three.js render path. Running that path
beside IFC-Lite would duplicate the renderer, camera and GPU state, which is the
performance and synchronization problem this rewrite is meant to remove.

## Decision

- Use the IFC-Lite point-cloud decoder in a dedicated worker.
- Stream decoded chunks into the existing IFC-Lite `Renderer`; never create a
  second canvas or Three.js renderer.
- Cap the browser preview by point count and expose the sampling stride.
- Apply point size and the per-asset model matrix directly through renderer
  uniforms. These operations request a frame but never rebuild or reframe the
  scene.
- Persist alignment and CRS labels in PostgreSQL. Keep point budget and point
  size local because they describe the current device, not project geometry.
- Keep the original in S3/MinIO. The decoder and renderer never become the
  permanent file store.

- Convert LAS/LAZ originals asynchronously with PotreeConverter 2.1.1 into the
  open Potree v2 `metadata.json`, `hierarchy.bin`, and `octree.bin` layout.
- Keep those three derived artifacts in S3/MinIO and their immutable references
  in PostgreSQL. They are disposable derivatives and are deleted with the
  asset; the uploaded original remains the source of truth.
- Give the browser short-lived signed URLs and fetch hierarchy and point data
  with exact HTTP byte ranges. Refresh the signed URLs without rebuilding the
  renderer.
- Select camera-relevant, additive Potree nodes against a local point budget.
  Decode fetched nodes off the main thread and stream them into independent
  IFC-Lite point-cloud handles in the existing native WebGPU renderer.
- Retain the bounded full-object preview for PLY and E57 because
  PotreeConverter does not ingest those formats in this deployment.

## Consequences

LAS and LAZ scans now use real camera-driven octree/LOD streaming without a
second renderer or a complete original-file download. Their hierarchy and
resident GPU nodes change as the camera or point budget changes. PLY and E57
remain development/medium-file previews and still require a bounded complete
download. A future converter can add tiled support for them behind the same
source and renderer ports.

## References

- [PotreeConverter 2.x](https://github.com/potree/PotreeConverter)
- [Potree 2.0 octree loader](https://github.com/potree/potree/blob/develop/src/modules/loader/2.0/OctreeLoader.js)
- [IFC-Lite rendering guide](https://ifclite.dev/docs/guide/rendering/)
