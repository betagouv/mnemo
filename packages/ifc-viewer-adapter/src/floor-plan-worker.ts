import init from "@ifc-lite/wasm";
import { generateFloorPlanDrawing } from "./floor-plan-computation";
import type { MeshData } from "@ifc-lite/geometry";

self.onmessage = async (
  event: MessageEvent<{ meshes: MeshData[]; elevation: number }>,
) => {
  try {
    await init();
    const drawing = await generateFloorPlanDrawing(
      event.data.meshes,
      event.data.elevation,
    );
    self.postMessage({ drawing });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Génération impossible.",
    });
  }
};
