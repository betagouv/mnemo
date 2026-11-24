import type { MeshData } from "@ifc-lite/geometry";
import { FederationRegistry } from "@ifc-lite/renderer";
import { ServerEntityIndex } from "@ifc-lite/server-client";
import type {
  DataModel,
  MeshData as ServerMesh,
} from "@ifc-lite/server-client";
import type { ProjectMapReference } from "@mnemo/contracts/map-reference";
import { beforeEach, expect, it, vi } from "vitest";

import { IfcModelLoader, type LoadedIfcModel } from "./ifc-model-loader";
import { ProjectFrame } from "./project-frame";
import { createEmptyViewerSnapshot } from "./viewer-snapshot";
import type { IfcViewerSnapshot } from "./viewer-types";

vi.mock("./server-data-store", () => ({
  createServerDataStore: () => ({ entityCount: 1 }),
}));

type Placement = { eastings: number; rtc?: [number, number, number] };
const placements = new Map<string, Placement | Error>();
let snapshot: IfcViewerSnapshot;
let added: MeshData[][];
let removed: number;

function mesh(): ServerMesh {
  return {
    express_id: 42,
    ifc_type: "IfcWall",
    positions: new Float32Array([0.001, 0, 0]),
    normals: new Float32Array([0, 1, 0]),
    indices: new Uint32Array([0]),
    color: [1, 1, 1, 1],
  };
}

function createLoader(reference: ProjectMapReference | null = null) {
  const models = new Map<string, LoadedIfcModel>();
  const loader = new IfcModelLoader({
    renderer: {
      addMeshes: (meshes: MeshData[]) => added.push(meshes),
      requestRender: () => undefined,
      getGPUDevice: () => null,
      getPipeline: () => null,
      getScene: () => ({
        removeMeshesForEntities: () => {
          removed += 1;
        },
      }),
    } as never,
    federation: new FederationRegistry(),
    models,
    projectFrame: new ProjectFrame({ reference }),
    runtime: {
      createGeometryProcessor: () => ({ dispose: () => undefined }) as never,
      createParser: () => ({}) as never,
      createBimIndex: () => ({ catalog: {} }) as never,
      fetch: vi.fn(),
      createServerClient: (assetId) => ({
        async stream(onBatch) {
          onBatch({ meshes: [mesh()], batch_number: 0, decode_time_ms: 0 });
          const placement = placements.get(assetId)!;
          if (placement instanceof Error) throw placement;
          return {
            maxExpressId: 42,
            dataModel: {
              entities: ServerEntityIndex.fromRows([]),
            } as unknown as DataModel,
            result: {
              cache_key: "key",
              total_meshes: 1,
              stats: { from_cache: false },
              metadata: {
                schema_version: "IFC4",
                entity_count: 1,
                length_unit_scale: 1,
                coordinate_info: { origin_shift: placement.rtc ?? [0, 0, 0] },
                georeferencing: {
                  source: "mapConversion",
                  crs_name: "EPSG:2154",
                  eastings: placement.eastings,
                  northings: 6862414,
                  orthogonal_height: 42,
                  x_axis_abscissa: 1,
                  x_axis_ordinate: 0,
                  scale: 1,
                },
              },
            } as never,
          };
        },
      }),
    },
    initialize: async () => undefined,
    isDisposed: () => false,
    getSnapshot: () => snapshot,
    updateSnapshot: (update) => (snapshot = { ...snapshot, ...update }),
    updateModelSnapshot: (assetId, update) => {
      const current = snapshot.models.find((item) => item.assetId === assetId);
      snapshot = {
        ...snapshot,
        models: [
          ...snapshot.models.filter((item) => item !== current),
          { ...current, ...update } as IfcViewerSnapshot["models"][number],
        ],
      };
    },
    onModelReady: () => undefined,
  });
  const load = (assetId: string) =>
    loader.load({
      assetId,
      fileName: `${assetId}.ifc`,
      downloadUrl: "",
      processing: { engine: "rust", serverBaseUrl: assetId },
    });
  return { loader, load, models };
}

beforeEach(() => {
  snapshot = createEmptyViewerSnapshot();
  added = [];
  removed = 0;
  placements.clear();
});

it("shows the first model progressively and places the next ones once", async () => {
  placements.set("a", { eastings: 652310 });
  placements.set("b", { eastings: 652322, rtc: [100_000, 0, 0] });
  const { load, loader } = createLoader();
  await load("a");
  await load("b");
  expect(added).toHaveLength(2);
  expect(added[0]![0]).not.toHaveProperty("origin");
  expect(added[1]![0]!.origin).toEqual([100_012, 0, 0]);
  // Map-sized translations never reach the f32 vertices.
  expect(added[1]![0]!.positions[0]).toBeCloseTo(0.001, 9);
  expect(loader.renderOrigin).toEqual({ x: 0, y: 0, z: 0 });
  expect(snapshot).toMatchObject({ phase: "ready", meshCount: 2 });
  expect(snapshot.models.map((model) => model.positioningIssues)).toEqual([
    [],
    [],
  ]);
});

it("expresses the scene in the persisted frame when its model is absent", async () => {
  placements.set("b", { eastings: 652322, rtc: [100_000, 0, 0] });
  const { load, loader, models } = createLoader({
    assetId: "a",
    crs: "EPSG:2154",
    verticalDatum: null,
    eastings: 652310,
    northings: 6862414,
    orthogonalHeight: 40,
    xAxisAbscissa: 1,
    xAxisOrdinate: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  });
  await load("b");
  // The scene stays near its origin; only the project coordinates are large.
  expect(added).toHaveLength(1);
  expect(added[0]![0]!.origin ?? [0, 0, 0]).toEqual([0, 0, 0]);
  expect(loader.renderOrigin).toEqual({ x: 100_012, y: 0, z: 2 });
  expect(models.get("b")!.sceneElevation(3)).toBe(3);
});

it("restores the scene after a failure so the model can be retried", async () => {
  placements.set("a", { eastings: 652310 });
  placements.set("b", new Error("Le serveur ne répond plus."));
  const { load } = createLoader();
  await load("a");
  await expect(load("b")).rejects.toThrow("ne répond plus");
  expect(added).toHaveLength(1);
  expect(removed).toBe(0);
  expect(snapshot).toMatchObject({ phase: "ready", meshCount: 1 });
  placements.set("b", { eastings: 652322 });
  await load("b");
  expect(added[1]![0]!.origin).toEqual([12, 0, 0]);
  expect(snapshot).toMatchObject({ phase: "ready", meshCount: 2 });
});
