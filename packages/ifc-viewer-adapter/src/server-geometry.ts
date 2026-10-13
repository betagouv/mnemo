import type { MeshData as BrowserMeshData } from "@ifc-lite/geometry";
import {
  decodeDataModel,
  decodeParquetGeometry,
  type DataModel,
  type MeshData as ServerMeshData,
  type ParquetBatch,
  type ParquetStreamResult,
} from "@ifc-lite/server-client";

export type IfcServerGeometryClient = {
  stream(
    onBatch: (batch: ParquetBatch) => void,
    signal?: AbortSignal,
  ): Promise<{
    result: ParquetStreamResult;
    maxExpressId: number;
    dataModel: DataModel;
  }>;
};

/** The IFC bytes stay in S3; the browser receives geometry and the decoded model. */
export function createIfcServerGeometryClient(
  baseUrl: string,
): IfcServerGeometryClient {
  return {
    async stream(onBatch, signal) {
      const response = await fetch(`${baseUrl}/stream`, {
        method: "POST",
        signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`Le traitement IFC a répondu HTTP ${response.status}.`);
      const maxExpressId = Number(
        response.headers.get("x-mnemo-max-express-id"),
      );
      if (!Number.isSafeInteger(maxExpressId) || maxExpressId < 1)
        throw new Error(
          "Le serveur IFC n'a pas fourni la plage des identifiants.",
        );
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pendingParts: string[] = [];
      let cacheKey = "";
      let stats: ParquetStreamResult["stats"] | null = null;
      let metadata: ParquetStreamResult["metadata"] | null = null;
      let totalMeshes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          let offset = 0;
          while (offset < chunk.length) {
            const end = chunk.indexOf("\n", offset);
            pendingParts.push(chunk.slice(offset, end < 0 ? undefined : end));
            if (end < 0) break;
            offset = end + 1;
            const line = pendingParts.join("");
            pendingParts = [];
            if (!line.startsWith("data:")) continue;
            const event = JSON.parse(line.slice(5).trim()) as {
              type: string;
              cache_key?: string;
              data?: string;
              batch_number?: number;
              vertex_base?: number;
              index_base?: number;
              stats?: ParquetStreamResult["stats"];
              metadata?: ParquetStreamResult["metadata"];
              message?: string;
            };
            if (event.type === "start") cacheKey = event.cache_key ?? "";
            if (event.type === "error")
              throw new Error(event.message ?? "Traitement IFC impossible.");
            if (event.type === "batch" && event.data) {
              if (
                event.vertex_base !== undefined ||
                event.index_base !== undefined
              )
                throw new Error(
                  "Disposition des lots IFC non prise en charge.",
                );
              const binary = atob(event.data);
              const bytes = new Uint8Array(binary.length);
              for (let index = 0; index < binary.length; index += 1)
                bytes[index] = binary.charCodeAt(index);
              const startedAt = performance.now();
              const meshes = await decodeParquetGeometry(bytes.buffer);
              totalMeshes += meshes.length;
              onBatch({
                meshes,
                batch_number: event.batch_number ?? 0,
                decode_time_ms: performance.now() - startedAt,
              });
            }
            if (event.type === "complete") {
              stats = event.stats ?? null;
              metadata = event.metadata ?? null;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!stats || !metadata || !cacheKey)
        throw new Error("Le flux IFC s'est terminé sans résultat complet.");
      const result: ParquetStreamResult = {
        cache_key: cacheKey,
        stats,
        metadata,
        total_meshes: totalMeshes,
      };
      const modelResponse = await fetch(`${baseUrl}/data-model`, { signal });
      if (!modelResponse.ok)
        throw new Error(
          `Les données IFC ont répondu HTTP ${modelResponse.status}.`,
        );
      return {
        result,
        maxExpressId,
        dataModel: await decodeDataModel(await modelResponse.arrayBuffer()),
      };
    },
  };
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
