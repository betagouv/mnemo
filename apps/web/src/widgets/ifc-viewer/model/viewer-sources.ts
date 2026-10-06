import type { LoadIfcInput } from "@mnemo/ifc-viewer-adapter";
import type {
  PointCloudSettings,
  PointCloudSource,
} from "@mnemo/contracts/point-clouds";

export type ViewerIfcSource = {
  assetId: string;
  fileName: string;
  processing: NonNullable<LoadIfcInput["processing"]>;
};

export type ViewerPointCloudSource = {
  assetId: string;
  fileName: string;
  source: PointCloudSource;
  settings: PointCloudSettings;
};

export type ViewerPointCloudFailure = {
  assetId: string;
  fileName: string;
  error: string;
};
