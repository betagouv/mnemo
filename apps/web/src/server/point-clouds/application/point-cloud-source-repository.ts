import type { AssetStatus } from "@mnemo/domain";

export type PointCloudSourceRecord = {
  asset: {
    id: string;
    kind: "point_cloud";
    status: AssetStatus;
    originalFileName: string;
    originalObjectKey: string;
  };
  result: {
    format: "copc-v1";
    copcObjectKey: string;
    pointCount: number;
    spacing: number;
  } | null;
};

export interface PointCloudSourceRepository {
  findForActor(
    actorId: string,
    projectId: string,
    assetId: string,
  ): Promise<PointCloudSourceRecord | null>;
}
