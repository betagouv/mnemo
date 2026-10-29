import type {
  PointCloudSettings,
  PointCloudSettingsInput,
  UpdatePointCloudSettingsInput,
} from "@mnemo/contracts/point-clouds";
import { hasProjectPermission } from "@mnemo/domain/project";

import type { PointCloudSettingsRepository } from "./point-cloud-settings-repository";

export class PointCloudSettingsAccessDeniedError extends Error {}

const defaultTransform: PointCloudSettings["transform"] = {
  position: [0, 0, 0],
  rotationDegrees: [-90, 0, 0],
  scale: [1, 1, 1],
};

function defaultSettings(assetId: string): PointCloudSettings {
  return {
    assetId,
    transform: defaultTransform,
    sourceCrs: null,
    targetCrs: null,
    updatedAt: null,
  };
}

export class PointCloudSettingsService {
  constructor(
    private readonly repository: PointCloudSettingsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(actorId: string, input: PointCloudSettingsInput) {
    const match = await this.repository.findForActor(
      actorId,
      input.projectId,
      input.assetId,
    );

    if (!match || match.kind !== "point_cloud") {
      throw new PointCloudSettingsAccessDeniedError(
        "Point cloud is not available to this actor",
      );
    }

    return match.settings ?? defaultSettings(match.assetId);
  }

  async update(actorId: string, input: UpdatePointCloudSettingsInput) {
    const match = await this.repository.findForActor(
      actorId,
      input.projectId,
      input.assetId,
    );

    if (
      !match ||
      match.kind !== "point_cloud" ||
      !hasProjectPermission(match, "project:update")
    ) {
      throw new PointCloudSettingsAccessDeniedError(
        "The actor cannot align this point cloud",
      );
    }

    return this.repository.save(actorId, input, this.now());
  }
}
