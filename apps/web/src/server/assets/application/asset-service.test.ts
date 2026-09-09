import type { ObjectStorage, StoredObject } from "@mnemo/storage";
import { describe, expect, it } from "vitest";

import type {
  ProjectForActor,
  ProjectRepository,
} from "@/server/projects/application/project-repository";

import { UnsupportedAssetFileError } from "./asset-errors";
import type {
  AssetForActor,
  AssetRepository,
  PendingAsset,
} from "./asset-repository";
import { AssetService } from "./asset-service";

const now = new Date("2026-09-09T10:00:00.000Z");
const project: ProjectForActor = {
  id: "8017a38c-385e-4ef4-87da-7cc1fb2a5e3b",
  name: "Projet test",
  description: null,
  role: "owner",
  createdAt: now,
  updatedAt: now,
};

class ProjectRepositoryStub implements ProjectRepository {
  async listForActor() {
    return [project];
  }

  async findForActor(_actorId: string, projectId: string) {
    return projectId === project.id ? project : undefined;
  }

  async createForActor() {
    return project;
  }
}

class AssetRepositoryStub implements AssetRepository {
  private asset: AssetForActor | undefined;
  enqueuedAssetIds: string[] = [];

  async listForActor() {
    return this.asset ? [this.asset] : [];
  }

  async findForActor() {
    return this.asset
      ? { asset: this.asset, role: "owner" as const }
      : undefined;
  }

  async createPending(input: PendingAsset) {
    this.asset = {
      ...input,
      status: "upload_pending",
      errorMessage: null,
      uploadedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.asset;
  }

  async markUploadedAndEnqueue(assetId: string, uploadedAt: Date) {
    if (!this.asset) {
      throw new Error("Missing test asset");
    }

    this.enqueuedAssetIds.push(assetId);
    this.asset = {
      ...this.asset,
      status: "uploaded",
      uploadedAt,
      updatedAt: uploadedAt,
    };
    return this.asset;
  }
}

class ObjectStorageStub implements ObjectStorage {
  downloadRequests: Array<{ objectKey: string; expiresInSeconds: number }> = [];
  storedObject: StoredObject | null = {
    contentLength: 42,
    contentType: "application/octet-stream",
    etag: "test-etag",
  };

  async createUploadUrl() {
    return "http://storage.local/upload";
  }

  async createDownloadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }) {
    this.downloadRequests.push(input);
    return "http://storage.local/download";
  }

  async statObject() {
    return this.storedObject;
  }

  async readObject() {
    return new Uint8Array();
  }

  async deleteObject() {}
}

function createService() {
  const assets = new AssetRepositoryStub();
  const storage = new ObjectStorageStub();
  const service = new AssetService(
    assets,
    new ProjectRepositoryStub(),
    storage,
    {
      createId: () => "2dc84044-62d6-4e2d-99ae-a8db4446b271",
      now: () => now,
    },
  );

  return { assets, service, storage };
}

describe("AssetService", () => {
  it("creates a short-lived server-owned upload target", async () => {
    await expect(
      createService().service.beginUpload("actor-id", {
        projectId: project.id,
        kind: "point_cloud",
        fileName: "releve.laz",
        mediaType: "application/octet-stream",
        sizeBytes: 42,
      }),
    ).resolves.toMatchObject({
      uploadUrl: "http://storage.local/upload",
      requiredHeaders: { "content-type": "application/octet-stream" },
      asset: {
        status: "upload_pending",
        originalFileName: "releve.laz",
      },
    });
  });

  it("rejects a file whose extension does not match its kind", async () => {
    await expect(
      createService().service.beginUpload("actor-id", {
        projectId: project.id,
        kind: "ifc",
        fileName: "releve.laz",
        mediaType: "application/octet-stream",
        sizeBytes: 42,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAssetFileError);
  });

  it("marks the upload received only after checking the stored size", async () => {
    const { assets, service } = createService();
    const started = await service.beginUpload("actor-id", {
      projectId: project.id,
      kind: "ifc",
      fileName: "model.ifc",
      mediaType: "application/x-step",
      sizeBytes: 42,
    });

    await expect(
      service.completeUpload("actor-id", {
        projectId: project.id,
        assetId: started.asset.id,
      }),
    ).resolves.toMatchObject({ status: "uploaded" });
    expect(assets.enqueuedAssetIds).toEqual([started.asset.id]);
  });

  it("opens an uploaded original through a short-lived authorized URL", async () => {
    const { service, storage } = createService();
    const started = await service.beginUpload("actor-id", {
      projectId: project.id,
      kind: "ifc",
      fileName: "model.ifc",
      mediaType: "application/x-step",
      sizeBytes: 42,
    });
    await service.completeUpload("actor-id", {
      projectId: project.id,
      assetId: started.asset.id,
    });

    await expect(
      service.open("actor-id", {
        projectId: project.id,
        assetId: started.asset.id,
      }),
    ).resolves.toMatchObject({
      asset: { id: started.asset.id, status: "uploaded" },
      downloadUrl: "http://storage.local/download",
      expiresAt: "2026-09-09T10:05:00.000Z",
    });
    expect(storage.downloadRequests).toEqual([
      {
        objectKey: expect.stringContaining(
          `/assets/${started.asset.id}/original.ifc`,
        ),
        expiresInSeconds: 300,
      },
    ]);
  });
});
