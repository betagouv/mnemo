import type { ProcessingJobHandler } from "./processing-job";

export type IfcProcessingResult = {
  processor: string;
  processorVersion: string;
  cacheKey: string;
  entityCount: number;
  geometryEntityCount: number;
  meshCount: number;
  cacheHit: boolean;
};

export type IfcAssetForProcessing = {
  id: string;
  originalObjectKey: string;
};

export interface IfcProcessingRepository {
  findIfcAsset(assetId: string): Promise<IfcAssetForProcessing | null>;
  saveResult(
    assetId: string,
    result: IfcProcessingResult,
    processedAt: Date,
  ): Promise<void>;
}

export interface OriginalObjectReader {
  readObject(objectKey: string): Promise<Uint8Array>;
}

export interface IfcProcessor {
  process(source: Uint8Array): Promise<IfcProcessingResult>;
}

export function createProcessIfcAssetHandler(input: {
  repository: IfcProcessingRepository;
  storage: OriginalObjectReader;
  processor: IfcProcessor;
  now?: () => Date;
}): ProcessingJobHandler {
  const now = input.now ?? (() => new Date());

  return async (job) => {
    const asset = await input.repository.findIfcAsset(job.assetId);
    if (!asset) {
      throw new Error(`IFC asset ${job.assetId} does not exist`);
    }

    const source = await input.storage.readObject(asset.originalObjectKey);
    const result = await input.processor.process(source);
    await input.repository.saveResult(asset.id, result, now());
  };
}
