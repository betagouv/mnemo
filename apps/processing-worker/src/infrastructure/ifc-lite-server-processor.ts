import {
  IfcServerClient,
  type HealthResponse,
  type ParquetBatch,
  type ParquetStreamResult,
} from "@ifc-lite/server-client";

export type ProcessedIfc = {
  processor: "ifc-lite-server";
  processorVersion: string;
  cacheKey: string;
  entityCount: number;
  geometryEntityCount: number;
  meshCount: number;
  cacheHit: boolean;
};

export type IfcLiteServerClientPort = {
  health(): Promise<HealthResponse>;
  parseParquetStream(
    source: File | ArrayBuffer,
    onBatch: (batch: ParquetBatch) => void,
  ): Promise<ParquetStreamResult>;
};

function exactArrayBuffer(source: Uint8Array) {
  return source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ) as ArrayBuffer;
}

export class IfcLiteServerProcessor {
  private readonly client: IfcLiteServerClientPort;

  constructor(
    serverBaseUrl: string,
    client: IfcLiteServerClientPort = new IfcServerClient({
      baseUrl: serverBaseUrl.replace(/\/$/, ""),
      timeout: 15 * 60 * 1_000,
    }),
  ) {
    this.client = client;
  }

  async process(source: Uint8Array): Promise<ProcessedIfc> {
    const health = await this.client.health();
    const result = await this.client.parseParquetStream(
      exactArrayBuffer(source),
      () => undefined,
    );

    return {
      processor: "ifc-lite-server",
      processorVersion: health.version,
      cacheKey: result.cache_key,
      entityCount: result.metadata.entity_count,
      geometryEntityCount: result.metadata.geometry_entity_count,
      meshCount: result.total_meshes,
      cacheHit: result.stats.from_cache,
    };
  }
}
