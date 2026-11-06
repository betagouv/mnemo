import type { Drawing2D } from "@ifc-lite/drawing-2d";
import type { MeshData } from "@ifc-lite/geometry";

/** Transfer disposable copies so cancellation never detaches the 3D scene's buffers. */
export async function computeFloorPlan(
  meshes: MeshData[],
  elevation: number,
  signal: AbortSignal,
): Promise<Drawing2D> {
  const copies: MeshData[] = [];
  const buffers: ArrayBuffer[] = [];
  // Section cuts and footprint outlines only consume positions and indices.
  const normals = new Float32Array(0);
  let sliceStarted = performance.now();
  for (const mesh of meshes) {
    signal.throwIfAborted();
    const positions = mesh.positions.slice();
    const indices = mesh.indices.slice();
    copies.push({
      expressId: mesh.expressId,
      ifcType: mesh.ifcType,
      modelIndex: mesh.modelIndex,
      origin: mesh.origin,
      color: mesh.color,
      positions,
      indices,
      normals,
    });
    buffers.push(positions.buffer, indices.buffer);
    if (performance.now() - sliceStarted > 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
  }
  signal.throwIfAborted();
  const worker = new Worker(new URL("./floor-plan-worker.ts", import.meta.url));
  let abort = () => {};
  try {
    return await new Promise<Drawing2D>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = (
        event: MessageEvent<{ drawing?: Drawing2D; error?: string }>,
      ) => {
        if (event.data.drawing) resolve(event.data.drawing);
        else reject(new Error(event.data.error ?? "Génération impossible."));
      };
      worker.onerror = (event) => {
        reject(
          new Error(event.message || "Le calcul du plan a été interrompu."),
        );
      };
      worker.onmessageerror = () => {
        reject(new Error("Le résultat du plan est illisible."));
      };
      worker.postMessage({ meshes: copies, elevation }, buffers);
    });
  } finally {
    signal.removeEventListener("abort", abort);
    worker.terminate();
  }
}
