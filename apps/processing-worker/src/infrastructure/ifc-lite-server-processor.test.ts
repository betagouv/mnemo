import type {
  HealthResponse,
  ParquetStreamResult,
} from "@ifc-lite/server-client";
import { describe, expect, it } from "vitest";

import {
  IfcLiteServerProcessor,
  type IfcLiteServerClientPort,
} from "./ifc-lite-server-processor";

describe("IfcLiteServerProcessor", () => {
  it("returns stable processing metadata while discarding streamed geometry", async () => {
    let streamedBytes = 0;
    const client: IfcLiteServerClientPort = {
      async health() {
        return {
          status: "healthy",
          service: "ifc-lite-server",
          version: "9.2.0",
        } satisfies HealthResponse;
      },
      async parseParquetStream(source, onBatch) {
        streamedBytes = source instanceof ArrayBuffer ? source.byteLength : 0;
        onBatch({ batch_number: 1, decode_time_ms: 2, meshes: [] });
        return {
          cache_key: "sha256-default",
          total_meshes: 73,
          stats: { from_cache: false },
          metadata: {
            entity_count: 1_500,
            geometry_entity_count: 420,
          },
        } as unknown as ParquetStreamResult;
      },
    };

    const processor = new IfcLiteServerProcessor(
      "http://ifc-lite.local/",
      client,
    );

    await expect(processor.process(Uint8Array.of(1, 2, 3))).resolves.toEqual({
      processor: "ifc-lite-server",
      processorVersion: "9.2.0",
      cacheKey: "sha256-default",
      entityCount: 1_500,
      geometryEntityCount: 420,
      meshCount: 73,
      cacheHit: false,
    });
    expect(streamedBytes).toBe(3);
  });
});
