import type { ProcessingJobHandler } from "./processing-job";

export type PointCloudAssetForProcessing = {
  id: string;
  originalObjectKey: string;
  sizeBytes: number;
};

export interface PointCloudProcessingRepository {
  findPointCloudAsset(
    assetId: string,
  ): Promise<PointCloudAssetForProcessing | null>;
}

export interface OriginalObjectInspector {
  statObject(objectKey: string): Promise<{ contentLength: number } | null>;
}

export function createProcessPointCloudAssetHandler(input: {
  repository: PointCloudProcessingRepository;
  storage: OriginalObjectInspector;
}): ProcessingJobHandler {
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
  };
}
