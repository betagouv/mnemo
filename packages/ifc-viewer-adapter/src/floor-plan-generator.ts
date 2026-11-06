import type { FederationRegistry, Renderer } from "@ifc-lite/renderer";
import type { MeshData } from "@ifc-lite/geometry";
import {
  createFloorPlanPropertyLookup,
  type FloorPlanDrawing,
} from "./floor-plan-drawing";
import { intersectsFloorPlan } from "./floor-plan-meshes";
import { computeFloorPlan } from "./floor-plan-worker-client";
import type { IfcModelLoader, LoadedIfcModel } from "./ifc-model-loader";

type FloorPlanScene = {
  disposed: boolean;
  models: ReadonlyMap<string, LoadedIfcModel>;
  renderer: Renderer;
  modelLoader: Pick<IfcModelLoader, "renderOrigin">;
  federation: FederationRegistry;
};
type CachedPlan = {
  model: LoadedIfcModel;
  drawing: FloorPlanDrawing;
  points: number;
};
const maxCachedPlans = 3;
const maxCachedPoints = 500_000;

function drawingPointCount(drawing: FloorPlanDrawing) {
  let points = drawing.lines.length * 2;
  for (const polygon of [
    ...drawing.cutPolygons,
    ...(drawing.layerBaseCutPolygons ?? []),
    ...drawing.projectionPolygons,
  ]) {
    points += polygon.polygon.outer.length;
    for (const hole of polygon.polygon.holes) points += hole.length;
  }
  return points;
}

/** One cancellable calculation and a bounded LRU per viewer lifetime. */
export class FloorPlanGenerator {
  private readonly cache = new Map<string, CachedPlan>();
  private active: {
    key: string;
    model: LoadedIfcModel;
    abort: AbortController;
    result: Promise<FloorPlanDrawing>;
  } | null = null;

  constructor(private readonly compute = computeFloorPlan) {}

  generate(context: FloorPlanScene, assetId: string, storeyId: number) {
    const model = context.models.get(assetId);
    const storey = model?.bimIndex.catalog.storeys.find(
      (level) => level.expressId === storeyId,
    );
    if (context.disposed || !model || storey?.elevation == null) {
      return Promise.reject(
        new Error("Ce niveau ne possède pas d'altitude disponible."),
      );
    }
    const elevation =
      storey.elevation + 1.2 - context.modelLoader.renderOrigin.z;
    const key = `${assetId}/${storeyId}/${elevation}`;
    if (this.active?.key === key && this.active.model === model)
      return this.active.result;
    this.cancel();
    const cached = this.cache.get(key);
    if (cached?.model === model) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached.drawing);
    }
    const abort = new AbortController();
    const result = this.build(context, model, elevation, abort.signal)
      .then((drawing) => {
        abort.signal.throwIfAborted();
        const points = drawingPointCount(drawing);
        if (points <= maxCachedPoints) {
          this.cache.delete(key);
          this.cache.set(key, { model, drawing, points });
          let total = [...this.cache.values()].reduce(
            (sum, entry) => sum + entry.points,
            0,
          );
          while (this.cache.size > maxCachedPlans || total > maxCachedPoints) {
            const oldest = this.cache.entries().next().value!;
            total -= oldest[1].points;
            this.cache.delete(oldest[0]);
          }
        }
        return drawing;
      })
      .finally(() => {
        if (this.active?.abort === abort) this.active = null;
      });
    this.active = { key, model, abort, result };
    return result;
  }

  cancel() {
    this.active?.abort.abort();
    this.active = null;
  }

  clear() {
    this.cancel();
    this.cache.clear();
  }

  private async build(
    context: FloorPlanScene,
    model: LoadedIfcModel,
    elevation: number,
    signal: AbortSignal,
  ): Promise<FloorPlanDrawing> {
    const scene = context.renderer.getScene();
    const meshes = new Set<MeshData>();
    let sliceStarted = performance.now();
    for (const id of model.meshIds) {
      signal.throwIfAborted();
      const pieces =
        scene.getMeshDataPieces(id, model.modelIndex) ??
        scene.getInstancedMeshDataPieces(id) ??
        [];
      for (const mesh of pieces)
        if (intersectsFloorPlan(mesh, elevation)) meshes.add(mesh);
      if (performance.now() - sliceStarted > 8) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        sliceStarted = performance.now();
      }
    }
    if (!meshes.size)
      throw new Error("Aucune géométrie disponible autour de ce niveau.");
    const drawing = await this.compute([...meshes], elevation, signal);
    signal.throwIfAborted();
    if (!drawing.lines.length && !drawing.cutPolygons.length)
      throw new Error("Aucun contour disponible pour ce niveau.");
    return {
      ...drawing,
      getElementProperties: createFloorPlanPropertyLookup(
        model.store,
        (id) => context.federation.fromGlobalId(id)?.expressId ?? id,
      ),
    };
  }
}
