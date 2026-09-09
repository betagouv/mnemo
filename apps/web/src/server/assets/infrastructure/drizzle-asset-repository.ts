import {
  assets,
  deletionJobs,
  processingJobs,
  projectMembers,
  type MnemoDatabase,
} from "@mnemo/database";
import { processingJobTypeForAsset } from "@mnemo/domain/processing-job";
import { and, desc, eq, ne } from "drizzle-orm";

import type {
  AssetForActor,
  AssetRepository,
  PendingAsset,
} from "../application/asset-repository";

const assetSelection = {
  id: assets.id,
  projectId: assets.projectId,
  kind: assets.kind,
  originalFileName: assets.originalFileName,
  mediaType: assets.mediaType,
  sizeBytes: assets.sizeBytes,
  originalObjectKey: assets.originalObjectKey,
  status: assets.status,
  errorMessage: assets.errorMessage,
  uploadExpiresAt: assets.uploadExpiresAt,
  uploadedAt: assets.uploadedAt,
  createdAt: assets.createdAt,
  updatedAt: assets.updatedAt,
};

export class DrizzleAssetRepository implements AssetRepository {
  constructor(private readonly database: MnemoDatabase) {}

  listForActor(actorId: string, projectId: string): Promise<AssetForActor[]> {
    return this.database
      .select(assetSelection)
      .from(assets)
      .innerJoin(projectMembers, eq(projectMembers.projectId, assets.projectId))
      .where(
        and(
          eq(assets.projectId, projectId),
          eq(projectMembers.userId, actorId),
          ne(assets.status, "deleting"),
        ),
      )
      .orderBy(desc(assets.createdAt));
  }

  async findForActor(actorId: string, projectId: string, assetId: string) {
    const [match] = await this.database
      .select({
        ...assetSelection,
        role: projectMembers.role,
      })
      .from(assets)
      .innerJoin(projectMembers, eq(projectMembers.projectId, assets.projectId))
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.projectId, projectId),
          eq(projectMembers.userId, actorId),
        ),
      )
      .limit(1);

    if (!match) {
      return undefined;
    }

    const { role, ...asset } = match;
    return { asset, role };
  }

  async createPending(input: PendingAsset): Promise<AssetForActor> {
    const [asset] = await this.database
      .insert(assets)
      .values({
        ...input,
        status: "upload_pending",
      })
      .returning(assetSelection);

    if (!asset) {
      throw new Error("Asset insertion returned no record");
    }

    return asset;
  }

  markUploadedAndEnqueue(assetId: string, uploadedAt: Date) {
    return this.database.transaction(async (transaction) => {
      const [updatedAsset] = await transaction
        .update(assets)
        .set({
          status: "uploaded",
          uploadedAt,
          updatedAt: uploadedAt,
        })
        .where(and(eq(assets.id, assetId), eq(assets.status, "upload_pending")))
        .returning(assetSelection);

      const asset =
        updatedAsset ??
        (
          await transaction
            .select(assetSelection)
            .from(assets)
            .where(eq(assets.id, assetId))
            .limit(1)
        )[0];

      if (!asset) {
        throw new Error("Asset update returned no record");
      }

      await transaction
        .insert(processingJobs)
        .values({
          assetId: asset.id,
          type: processingJobTypeForAsset(asset.kind),
        })
        .onConflictDoNothing();

      return asset;
    });
  }

  async requestDeletion(assetId: string, requestedAt: Date) {
    await this.database.transaction(async (transaction) => {
      const [asset] = await transaction
        .update(assets)
        .set({ status: "deleting", updatedAt: requestedAt })
        .where(eq(assets.id, assetId))
        .returning({
          id: assets.id,
          originalObjectKey: assets.originalObjectKey,
        });

      if (!asset) return;

      await transaction
        .insert(deletionJobs)
        .values({
          resourceId: asset.id,
          type: "delete_asset",
          objectKeys: [asset.originalObjectKey],
          availableAt: requestedAt,
        })
        .onConflictDoNothing();
    });
  }
}
