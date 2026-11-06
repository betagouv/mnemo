import type { PointCloudTransform } from "@mnemo/ifc-viewer-adapter";
export type PointCloudConfiguration = {
  assetId: string;
  fileName: string;
  transform: PointCloudTransform;
  sourceCrs: string | null;
  targetCrs: string | null;
};
