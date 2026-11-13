import type { ProcessingProgress } from "@mnemo/contracts/assets";
export type ReportProcessingProgress = (
  progress: Pick<ProcessingProgress, "phase" | "percent">,
) => void;

export type PointCloudAssetForProcessing = {
  id: string;
  projectId: string;
  originalFileName: string;
  originalObjectKey: string;
  sizeBytes: number;
};

type PointCloudProcessingResultBase = {
  processor: string;
  processorVersion: string;
  pointCount: number;
  spacing: number;
};

export type PointCloudProcessingResult = PointCloudProcessingResultBase & {
  format: "copc-v1";
  copcObjectKey: string;
};

export interface PointCloudProcessingRepository {
  saveProgress(
    progress: ProcessingProgress,
    lease: { jobId: string; attempt: number; workerId: string },
  ): Promise<boolean>;

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
    reportProgress?: ReportProcessingProgress,
  ): Promise<PointCloudProcessingResult | null>;
  remove(result: PointCloudProcessingResult): Promise<void>;
}
