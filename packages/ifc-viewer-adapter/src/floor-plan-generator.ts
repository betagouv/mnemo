import { createFloorPlanPropertyLookup } from "./floor-plan-drawing";
import type { FederationRegistry, Renderer } from "@ifc-lite/renderer";
import type { IfcModelLoader, LoadedIfcModel } from "./ifc-model-loader";

type FloorPlanScene = {
  disposed: boolean;
  models: ReadonlyMap<string, LoadedIfcModel>;
  renderer: Renderer;
  modelLoader: Pick<IfcModelLoader, "renderOrigin">;
  federation: FederationRegistry;
};

export async function generateSceneFloorPlan(
  context: FloorPlanScene,
  assetId: string,
  storeyId: number,
) {
  const model = context.models.get(assetId);
  const storey = model?.bimIndex.catalog.storeys.find(
    (level) => level.expressId === storeyId,
  );
  if (context.disposed || !model || storey?.elevation == null) {
    throw new Error("Ce niveau ne possède pas d'altitude disponible.");
  }
  const { generateFloorPlan } = await import("@ifc-lite/drawing-2d");
  const scene = context.renderer.getScene();
  const meshes = new Set<import("@ifc-lite/geometry").MeshData>();
  for (const id of model.meshIds) {
    const pieces =
      scene.getMeshDataPieces(id, model.modelIndex) ??
      scene.getInstancedMeshDataPieces(id) ??
      [];
    for (const mesh of pieces) meshes.add(mesh);
  }
  if (!meshes.size)
    throw new Error("La géométrie de cette maquette n'est plus disponible.");
  const drawing = await generateFloorPlan(
    [...meshes],
    storey.elevation + 1.2 - context.modelLoader.renderOrigin.z,
    { includeProjection: true, includeHiddenLines: false },
  );
  if (!drawing.lines.length && !drawing.cutPolygons.length) {
    throw new Error("Aucun contour disponible pour ce niveau.");
  }
  return {
    ...drawing,
    getElementProperties: createFloorPlanPropertyLookup(
      model.store,
      (id) => context.federation.fromGlobalId(id)?.expressId ?? id,
    ),
  };
}
