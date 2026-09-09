# IFC-Lite current API spike

Date: 2026-09-09

Status: accepted as the implementation baseline for the first viewer slices.

## Purpose

This spike records the APIs present in the current published packages before we
build the viewer. The declarations and current upstream sources were inspected
in addition to the documentation because some rendering examples describe
older public APIs.

## Versions inspected

| Package                   | Version |
| ------------------------- | ------: |
| `@ifc-lite/parser`        | `5.2.0` |
| `@ifc-lite/geometry`      | `4.3.0` |
| `@ifc-lite/renderer`      | `2.0.1` |
| `@ifc-lite/query`         | `2.2.0` |
| `@ifc-lite/server-client` | `2.0.0` |
| `@ifc-lite/pointcloud`    | `0.7.2` |
| `@ifc-lite/bcf`           | `3.0.1` |

The application must pin these versions when each adapter is introduced. An
upgrade is a deliberate dependency change followed by a real-model viewer test.

## Chosen integration

### Renderer ownership

`@ifc-lite/renderer` owns the single WebGPU canvas. A stable application-owned
`ViewerController` owns the following mutable objects:

- `Renderer` and its GPU lifetime;
- `GeometryProcessor` and parsed model stores;
- loaded IFC and point-cloud layer handles;
- camera commands, selection, visibility, color and transforms.

React creates the controller once on mount, sends commands to it when interface
state changes, and destroys it once on unmount. React state must never recreate
the renderer or implicitly call `fitToView`.

### IFC loading paths

The first vertical slice supports local browser processing:

1. obtain a short-lived, authorized URL for the original IFC in MinIO/S3;
2. download it in the browser;
3. parse it with `IfcParser.parseColumnar()`;
4. process geometry with `GeometryProcessor.processAdaptive()`;
5. progressively add meshes to `Renderer.addMeshes()`;
6. frame once after the explicit model load.

The heavy-file adapter will use the IFC-Lite Rust server and
`@ifc-lite/server-client`:

- the original remains in MinIO/S3;
- the Rust server remains a disposable content-addressed processing cache;
- `parseParquetStream` provides cached Parquet/SSE progressive replay;
- the background worker pre-warms processing and records cache metadata;
- server-client snake_case mesh fields are mapped to renderer camelCase fields;
- `MeshData.origin` is preserved during that mapping.

The boundary between these paths belongs to an application load policy, not to
React components.

### Interaction and BIM semantics

The current packages expose the primitives required by the product:

- `Renderer.pick()` for scene picking;
- parser entity indexes plus `getName()` and `getGlobalId()`;
- on-demand property extraction and `spatialHierarchy`;
- `IfcQuery.ofType()`, `walls()`, `doors()`, `columns()`, `storeys()` and
  `onStorey()`;
- renderer `hiddenIds`, `isolatedIds`, `selectedIds`,
  `transparencyOverrides`, `ghostExceptIds` and `ghostAlpha` options;
- `Renderer.getScene().setColorOverrides()` for per-entity colors.

The isolation opacity stays a local interface preference. Disabling ghost mode
actually hides non-matching entities. The assistant can choose what is isolated
or colored, but it cannot change that preference.

The rendering guide still says that dynamic per-entity colors are not public.
The current published declarations and the current upstream viewer use the
public `SceneContents.setColorOverrides()` method. The adapter encapsulates this
API so a future renderer change affects one module.

### Point clouds

`@ifc-lite/pointcloud` currently parses LAS, LAZ, PLY, PCD, E57, PTS, XYZ and
IFCx point schemas. It offers worker-backed streaming and a soft default cap of
25 million points, but it is not a persistent octree/LOD system for arbitrarily
large surveys.

The current renderer natively exposes:

- `beginPointCloudStream()`;
- `appendPointCloudChunk()`;
- `endPointCloudStream()`;
- `removePointCloudAsset()`;
- `setPointCloudOptions()`;
- `setPointCloudTransform()`.

This keeps IFC and point clouds in one depth-tested WebGPU scene. Point size and
transforms are cheap live renderer updates and must not rebuild or duplicate
point nodes.

The first point-cloud slice may use the native streaming path for bounded files.
Genuinely large datasets require a separate server conversion and octree/LOD
adapter backed by derived objects in S3/MinIO and a configurable point budget.
Potree remains a possible conversion format, not a second renderer layered over
the IFC canvas.

LAZ requires a custom worker URL: the package's default Blob worker cannot
resolve the laz-perf WASM URL. This must be solved in the point-cloud adapter and
tested through the production Next.js build.

### BCF

`@ifc-lite/bcf` supports BCF 2.1/3.0 topics, comments, viewpoints, camera state,
selection/visibility/color state, screenshots, and import/export. PostgreSQL
will remain the source of truth for collaborative business state; the package
is the BCF serialization and model-integration adapter.

## Browser and deployment requirements

IFC parsing workers require cross-origin isolation. Next.js must send these
headers on the viewer and worker resources:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The viewer must present explicit states for WebGPU unavailability, device loss,
download, parsing, geometry production, ready state and load failure.

## Acceptance tests for the viewer foundation

- the controller initializes one renderer for one mounted canvas;
- loading a model frames it once;
- changing any panel state does not recreate the renderer or reset the camera;
- renderer commands request a frame without reconstructing the scene;
- a second explicit model load releases the first model resources;
- browser validation uses a real IFC fixture, not only mocked meshes;
- a production build has the required cross-origin isolation headers.

## Sources checked

- <https://ifclite.dev/docs/guide/installation/>
- <https://ifclite.dev/docs/guide/server/>
- <https://ifclite.dev/docs/tutorials/building-viewer/>
- <https://ifclite.dev/docs/guide/rendering/>
- <https://ifclite.dev/docs/architecture/rendering-pipeline/>
- <https://ifclite.dev/docs/guide/bcf/>
- current package declarations published on npm
- current LTplus-AG/ifc-lite viewer sources
