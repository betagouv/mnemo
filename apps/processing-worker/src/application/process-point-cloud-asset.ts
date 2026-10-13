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
    lease?: { jobId: string; attempt: number; workerId: string },
  ): Promise<boolean>;
}

export interface PointCloudArtifactBuilder {
  build(
    asset: PointCloudAssetForProcessing,
  ): Promise<PointCloudProcessingResult | null>;
  remove(result: PointCloudProcessingResult): Promise<void>;
}
