import { assets, projectMembers, type MnemoDatabase } from "@mnemo/database";
import { and, desc, eq } from "drizzle-orm";

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

  async markUploaded(assetId: string, uploadedAt: Date) {
    const [asset] = await this.database
      .update(assets)
      .set({
        status: "uploaded",
        uploadedAt,
        updatedAt: uploadedAt,
      })
      .where(eq(assets.id, assetId))
      .returning(assetSelection);

    if (!asset) {
      throw new Error("Asset update returned no record");
    }

    return asset;
  }
}
