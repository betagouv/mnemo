import type { MeshData as BrowserMeshData } from "@ifc-lite/geometry";
import {
  IfcServerClient,
  type MeshData as ServerMeshData,
  type ParquetBatch,
  type ParquetStreamResult,
} from "@ifc-lite/server-client";

export type IfcServerGeometryClient = {
  parseParquetStream(
    source: File | ArrayBuffer,
    onBatch: (batch: ParquetBatch) => void,
  ): Promise<ParquetStreamResult>;
};

export function createIfcServerGeometryClient(
  serverBaseUrl: string,
): IfcServerGeometryClient {
  return new IfcServerClient({
    baseUrl: serverBaseUrl.replace(/\/$/, ""),
    timeout: 15 * 60 * 1_000,
  });
}

export function toBrowserMeshData(
  mesh: ServerMeshData,
): BrowserMeshData | null {
  if ((mesh.geometry_class ?? 0) === 2) return null;

  return {
    expressId: mesh.express_id,
    positions: mesh.positions,
    indices: mesh.indices,
    normals: mesh.normals,
    color: mesh.color,
    ifcType: mesh.ifc_type,
    ...(mesh.origin?.some((coordinate) => coordinate !== 0)
      ? { origin: mesh.origin }
      : {}),
    ...(mesh.geometry_class !== undefined
      ? { geometryClass: mesh.geometry_class }
      : {}),
    ...(mesh.geometry_item_id !== undefined
      ? { geometryItemId: mesh.geometry_item_id }
      : {}),
    ...(mesh.material_id !== undefined ? { materialId: mesh.material_id } : {}),
  };
}

export function toBrowserMeshBatch(meshes: readonly ServerMeshData[]) {
  return meshes
    .map(toBrowserMeshData)
    .filter((mesh): mesh is BrowserMeshData => mesh !== null);
}
