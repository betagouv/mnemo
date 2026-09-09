# ADR 0009 — Point-cloud ingestion and rendering

## Status

Accepted for the browser-preview foundation. The tiled large-file backend is a
separate feature.

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

The follow-up large-file feature will convert the original into a spatially
tiled artifact and range-load only camera-relevant nodes. It may reuse an open
octree file format, but its loader must feed IFC-Lite point-cloud handles rather
than mount Potree's Three.js renderer.

## Consequences

Small and medium scans can be overlaid now with one renderer, progressive GPU
upload and bounded point count. Large remote scans still incur a complete Blob
download and therefore must not be described as true LOD. The adapter boundary
allows that source to be replaced by an octree/COPC source without changing the
viewer UI, persisted transform or renderer host.
