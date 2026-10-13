import type { ObjectStorage } from "@mnemo/storage";

import type { AssetService } from "@/server/assets/application/asset-service";

export type IfcCacheRepository = {
  save(
    assetId: string,
    cacheKey: string,
    metadata: {
      entityCount: number;
      geometryEntityCount: number;
      meshCount: number;
      cacheHit: boolean;
      processorVersion: string;
    },
  ): Promise<void>;
  findKey(assetId: string): Promise<string | null>;
};

export class IfcStreamingService {
  constructor(
    private readonly assets: AssetService,
    private readonly storage: ObjectStorage,
    private readonly cache: IfcCacheRepository,
    private readonly serverUrl: string,
    private readonly serverToken: string,
  ) {}

  async stream(
    actorId: string,
    projectId: string,
    assetId: string,
    signal: AbortSignal,
  ) {
    const asset = await this.assets.locateOriginal(actorId, {
      projectId,
      assetId,
    });
    if (asset.kind !== "ifc" || asset.status !== "ready") {
      throw new Error("The IFC model is not ready");
    }
    const sourceUrl = await this.storage.createInternalDownloadUrl({
      objectKey: asset.originalObjectKey,
      expiresInSeconds: 30 * 60,
    });
    const upstream = await fetch(`${this.serverUrl}/api/v1/parse/from-s3`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.serverToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sourceUrl }),
      signal,
    });
    if (!upstream.ok || !upstream.body) {
      throw new Error(`IFC-Lite Rust returned HTTP ${upstream.status}`);
    }

    let cacheKey: string | null = null;
    let pending = "";
    let skipBatchLine = false;
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();
    const cache = this.cache;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          let offset = 0;
          while (offset < chunk.length) {
            const end = chunk.indexOf("\n", offset);
            const part = chunk.slice(offset, end < 0 ? undefined : end);
            if (!skipBatchLine) {
              pending += part;
              if (pending.startsWith('data: {"type":"batch"')) {
                pending = "";
                skipBatchLine = true;
              }
            }
            if (end < 0) break;
            offset = end + 1;
            if (skipBatchLine) {
              skipBatchLine = false;
              continue;
            }
            const line = pending;
            pending = "";
            if (!line.startsWith("data:")) continue;
            let event: unknown;
            try {
              event = JSON.parse(line.slice(5));
            } catch {
              continue;
            }
            if (!event || typeof event !== "object" || !("type" in event))
              continue;
            if (
              event.type === "start" &&
              "cache_key" in event &&
              typeof event.cache_key === "string"
            ) {
              cacheKey = event.cache_key;
            }
            if (
              event.type === "complete" &&
              cacheKey &&
              "metadata" in event &&
              "stats" in event
            ) {
              const metadata = event.metadata as Record<string, unknown>;
              const stats = event.stats as Record<string, unknown>;
              await cache.save(assetId, cacheKey, {
                entityCount: Number(metadata.entity_count ?? 0),
                geometryEntityCount: Number(
                  metadata.geometry_entity_count ?? 0,
                ),
                meshCount: Number(stats.total_meshes ?? 0),
                cacheHit: Boolean(stats.from_cache),
                processorVersion:
                  upstream.headers.get("x-mnemo-processor-version") ??
                  "unknown",
              });
            }
          }
          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        void reader.cancel();
      },
    });
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
        "x-mnemo-max-express-id":
          upstream.headers.get("x-mnemo-max-express-id") ?? "",
      },
    });
  }

  async dataModel(actorId: string, projectId: string, assetId: string) {
    const asset = await this.assets.locateOriginal(actorId, {
      projectId,
      assetId,
    });
    if (asset.kind !== "ifc" || asset.status !== "ready") {
      throw new Error("The IFC model is not ready");
    }
    const cacheKey = await this.cache.findKey(assetId);
    if (!cacheKey)
      return new Response(null, {
        status: 202,
        headers: { "retry-after": "1" },
      });
    const upstream = await fetch(
      `${this.serverUrl}/api/v1/parse/data-model/${encodeURIComponent(cacheKey)}`,
      {
        headers: { authorization: `Bearer ${this.serverToken}` },
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  }
}
