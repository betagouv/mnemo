import type {
  PointCloudSettings,
  UpdatePointCloudSettingsInput,
} from "@mnemo/contracts/point-clouds";
import type { AssetKind, ProjectRole } from "@mnemo/domain";

export type PointCloudSettingsForActor = {
  assetId: string;
  kind: AssetKind;
  role: ProjectRole;
  settings: PointCloudSettings | null;
};

export interface PointCloudSettingsRepository {
  findForActor(
    actorId: string,
    projectId: string,
    assetId: string,
  ): Promise<PointCloudSettingsForActor | null>;
  save(
    actorId: string,
    input: UpdatePointCloudSettingsInput,
    updatedAt: Date,
  ): Promise<PointCloudSettings>;
}
