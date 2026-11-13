import type { ProcessingProgress } from "@mnemo/contracts/assets";
import type { AssetKind, AssetStatus, ProjectAccess } from "@mnemo/domain";

export type AssetForActor = {
  id: string;
  projectId: string;
  kind: AssetKind;
  originalFileName: string;
  mediaType: string;
  sizeBytes: number;
  originalObjectKey: string;
  status: AssetStatus;
  errorMessage: string | null;
  processingProgress?: ProcessingProgress | null;
  uploadExpiresAt: Date;
  uploadedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PendingAsset = Omit<
  AssetForActor,
  "status" | "errorMessage" | "uploadedAt" | "createdAt" | "updatedAt"
> & {
  createdBy: string;
};

export interface AssetRepository {
  listForActor(actorId: string, projectId: string): Promise<AssetForActor[]>;
  findForActor(
    actorId: string,
    projectId: string,
    assetId: string,
  ): Promise<({ asset: AssetForActor } & ProjectAccess) | undefined>;
  createPending(input: PendingAsset): Promise<AssetForActor>;
  completeUpload(assetId: string, uploadedAt: Date): Promise<AssetForActor>;
  requestDeletion(assetId: string, requestedAt: Date): Promise<void>;
}
