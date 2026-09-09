import type {
  PointCloudSettingsInput,
  PointCloudSource,
} from "@mnemo/contracts/point-clouds";
import type { ObjectStorage } from "@mnemo/storage";

import type { PointCloudSourceRepository } from "./point-cloud-source-repository";

const accessTtlSeconds = 15 * 60;

export class PointCloudSourceAccessDeniedError extends Error {}

export class PointCloudSourceService {
  constructor(
    private readonly repository: PointCloudSourceRepository,
    private readonly storage: Pick<ObjectStorage, "createDownloadUrl">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async open(
    actorId: string,
    input: PointCloudSettingsInput,
  ): Promise<PointCloudSource> {
    const record = await this.repository.findForActor(
      actorId,
      input.projectId,
      input.assetId,
    );
    if (!record || record.asset.status !== "ready") {
      throw new PointCloudSourceAccessDeniedError(
        "Point cloud is not available to this actor",
      );
    }

    const expiresAt = new Date(
      this.now().getTime() + accessTtlSeconds * 1_000,
    ).toISOString();
    if (!record.result) {
      return {
        mode: "preview",
        downloadUrl: await this.sign(record.asset.originalObjectKey),
        expiresAt,
      };
    }

    const [metadataUrl, hierarchyUrl, octreeUrl] = await Promise.all([
      this.sign(record.result.metadataObjectKey),
      this.sign(record.result.hierarchyObjectKey),
      this.sign(record.result.octreeObjectKey),
    ]);
    return {
      mode: "octree",
      metadataUrl,
      hierarchyUrl,
      octreeUrl,
      pointCount: record.result.pointCount,
      spacing: record.result.spacing,
      expiresAt,
    };
  }

  private sign(objectKey: string) {
    return this.storage.createDownloadUrl({
      objectKey,
      expiresInSeconds: accessTtlSeconds,
    });
  }
}
