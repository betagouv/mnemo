import type { ProcessingJobHandler } from "./processing-job";

export type PointCloudAssetForProcessing = {
  id: string;
  projectId: string;
  originalFileName: string;
  originalObjectKey: string;
  sizeBytes: number;
};

export type PointCloudProcessingResult = {
  format: "potree-v2";
  processor: string;
  processorVersion: string;
  metadataObjectKey: string;
  hierarchyObjectKey: string;
  octreeObjectKey: string;
  pointCount: number;
  spacing: number;
};

export interface PointCloudProcessingRepository {
  findPointCloudAsset(
    assetId: string,
  ): Promise<PointCloudAssetForProcessing | null>;
  saveResult(
    assetId: string,
    result: PointCloudProcessingResult,
    processedAt: Date,
  ): Promise<boolean>;
}

export interface OriginalObjectInspector {
  statObject(objectKey: string): Promise<{ contentLength: number } | null>;
}

export interface PointCloudArtifactBuilder {
  build(
    asset: PointCloudAssetForProcessing,
  ): Promise<PointCloudProcessingResult | null>;
  remove(result: PointCloudProcessingResult): Promise<void>;
}

export function createProcessPointCloudAssetHandler(input: {
  repository: PointCloudProcessingRepository;
  storage: OriginalObjectInspector;
  artifacts: PointCloudArtifactBuilder;
  now?: () => Date;
}): ProcessingJobHandler {
  const now = input.now ?? (() => new Date());

  return async (job) => {
    const asset = await input.repository.findPointCloudAsset(job.assetId);
    if (!asset) {
      throw new Error(`Point-cloud asset ${job.assetId} does not exist`);
    }

    const object = await input.storage.statObject(asset.originalObjectKey);
    if (!object || object.contentLength !== asset.sizeBytes) {
      throw new Error(
        `Point-cloud original ${asset.originalObjectKey} is missing or incomplete`,
      );
    }

    const result = await input.artifacts.build(asset);
    if (!result) return;

    const saved = await input.repository.saveResult(asset.id, result, now());
    if (!saved) await input.artifacts.remove(result);
  };
}
