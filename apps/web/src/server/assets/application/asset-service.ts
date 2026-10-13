import { randomUUID } from "node:crypto";

import type {
  AssetList,
  AssetSummary,
  BeginAssetUploadInput,
  BeginAssetUploadResult,
  CompleteAssetUploadInput,
  DeleteAssetInput,
  OpenAssetInput,
  OpenAssetResult,
} from "@mnemo/contracts/assets";
import { canUploadAsset, supportsAssetFile } from "@mnemo/domain/asset";
import { hasProjectPermission } from "@mnemo/domain/project";
import { buildOriginalObjectKey, type ObjectStorage } from "@mnemo/storage";

import type { ProjectRepository } from "@/server/projects/application/project-repository";

import {
  AssetAccessDeniedError,
  AssetUploadVerificationError,
  UnsupportedAssetFileError,
} from "./asset-errors";
import type { AssetForActor, AssetRepository } from "./asset-repository";

const uploadTtlSeconds = 15 * 60;
const downloadTtlSeconds = 5 * 60;

function toAssetSummary(asset: AssetForActor): AssetSummary {
  return {
    id: asset.id,
    projectId: asset.projectId,
    kind: asset.kind,
    originalFileName: asset.originalFileName,
    mediaType: asset.mediaType,
    sizeBytes: asset.sizeBytes,
    status: asset.status,
    errorMessage: asset.errorMessage,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export type AssetServiceOptions = {
  createId?: () => string;
  now?: () => Date;
};

export class AssetService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly assets: AssetRepository,
    private readonly projects: ProjectRepository,
    private readonly storage: ObjectStorage,
    options: AssetServiceOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async list(actorId: string, projectId: string): Promise<AssetList> {
    const project = await this.projects.findForActor(actorId, projectId);

    if (!project) {
      throw new AssetAccessDeniedError(
        "Project is not available to this actor",
      );
    }

    return (await this.assets.listForActor(actorId, projectId)).map(
      toAssetSummary,
    );
  }

  async beginUpload(
    actorId: string,
    input: BeginAssetUploadInput,
  ): Promise<BeginAssetUploadResult> {
    const project = await this.projects.findForActor(actorId, input.projectId);

    if (!project || !canUploadAsset(project.role)) {
      throw new AssetAccessDeniedError(
        "The actor cannot upload files to this project",
      );
    }

    if (!supportsAssetFile(input.kind, input.fileName)) {
      throw new UnsupportedAssetFileError(
        `The file is not supported as ${input.kind}`,
      );
    }

    const assetId = this.createId();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + uploadTtlSeconds * 1_000);
    const originalObjectKey = buildOriginalObjectKey({
      projectId: input.projectId,
      assetId,
      fileName: input.fileName,
    });
    const uploadUrl = await this.storage.createUploadUrl({
      objectKey: originalObjectKey,
      contentType: input.mediaType,
      expiresInSeconds: uploadTtlSeconds,
    });
    const asset = await this.assets.createPending({
      id: assetId,
      projectId: input.projectId,
      kind: input.kind,
      originalFileName: input.fileName,
      mediaType: input.mediaType,
      sizeBytes: input.sizeBytes,
      originalObjectKey,
      uploadExpiresAt: expiresAt,
      createdBy: actorId,
    });

    return {
      asset: toAssetSummary(asset),
      uploadUrl,
      requiredHeaders: {
        "content-type": input.mediaType,
      },
      expiresAt: expiresAt.toISOString(),
    };
  }

  async completeUpload(
    actorId: string,
    input: CompleteAssetUploadInput,
  ): Promise<AssetSummary> {
    const match = await this.assets.findForActor(
      actorId,
      input.projectId,
      input.assetId,
    );

    if (!match || !canUploadAsset(match.role)) {
      throw new AssetAccessDeniedError(
        "The upload is not available to this actor",
      );
    }

    if (match.asset.status !== "upload_pending") {
      return toAssetSummary(match.asset);
    }

    const storedObject = await this.storage.statObject(
      match.asset.originalObjectKey,
    );

    if (!storedObject || storedObject.contentLength !== match.asset.sizeBytes) {
      throw new AssetUploadVerificationError(
        "The uploaded object is missing or has an unexpected size",
      );
    }

    return toAssetSummary(
      await this.assets.completeUpload(match.asset.id, this.now()),
    );
  }

  async open(actorId: string, input: OpenAssetInput): Promise<OpenAssetResult> {
    const asset = await this.locateOriginal(actorId, input);

    const now = this.now();
    const expiresAt = new Date(now.getTime() + downloadTtlSeconds * 1_000);
    const downloadUrl = await this.storage.createDownloadUrl({
      objectKey: asset.originalObjectKey,
      expiresInSeconds: downloadTtlSeconds,
    });

    return {
      asset: toAssetSummary(asset),
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async locateOriginal(actorId: string, input: OpenAssetInput) {
    const match = await this.assets.findForActor(
      actorId,
      input.projectId,
      input.assetId,
    );

    if (
      !match ||
      match.asset.status === "upload_pending" ||
      match.asset.status === "deleting"
    ) {
      throw new AssetAccessDeniedError(
        "The asset is not available to this actor",
      );
    }

    return match.asset;
  }

  async delete(actorId: string, input: DeleteAssetInput) {
    const match = await this.assets.findForActor(
      actorId,
      input.projectId,
      input.assetId,
    );

    if (!match || !hasProjectPermission(match.role, "asset:delete")) {
      throw new AssetAccessDeniedError(
        "The actor cannot delete this project asset",
      );
    }

    await this.assets.requestDeletion(match.asset.id, this.now());
    return { accepted: true as const };
  }
}
