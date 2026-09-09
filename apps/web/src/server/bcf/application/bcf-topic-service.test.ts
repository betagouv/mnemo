import type { ObjectStorage } from "@mnemo/storage";
import { describe, expect, it, vi } from "vitest";

import type { ProjectRepository } from "@/server/projects/application/project-repository";

import {
  BcfSnapshotVerificationError,
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
} from "./bcf-topic-errors";
import type {
  BcfTopicRepository,
  StoredBcfTopic,
} from "./bcf-topic-repository";
import { BcfTopicService } from "./bcf-topic-service";

const projectId = "d14ccec4-b8c9-437e-89af-0690c9c9682b";
const topicId = "a805b627-40b3-45c1-9d13-91042c67f025";
const viewpointId = "9f313504-b442-4df1-97d5-c6451f5d8c80";
const now = new Date("2026-09-09T19:00:00.000Z");

function topic(): StoredBcfTopic {
  return {
    id: topicId,
    projectId,
    title: "Porte à vérifier",
    description: null,
    type: "issue",
    status: "open",
    priority: "normal",
    authorName: "Erwan",
    components: [],
    comments: [],
    viewpoints: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function projects(role: "owner" | "editor" | "viewer"): ProjectRepository {
  return {
    listForActor: async () => [],
    findForActor: async () => ({
      id: projectId,
      name: "Projet",
      description: null,
      role,
      createdAt: now,
      updatedAt: now,
    }),
    createForActor: async () => {
      throw new Error("not used");
    },
    requestDeletion: async () => undefined,
  };
}

function repository(): BcfTopicRepository {
  return {
    list: vi.fn(async () => [topic()]),
    create: vi.fn(async () => topic()),
    addComment: vi.fn(async () => topic()),
    updateStatus: vi.fn(async () => topic()),
    createViewpoint: vi.fn(async () => topic()),
    findViewpoint: vi.fn(async () => null),
    markViewpointSnapshotUploaded: vi.fn(async () => topic()),
  };
}

function storage(): ObjectStorage {
  return {
    createUploadUrl: vi.fn(async () => "http://storage.local/upload"),
    createDownloadUrl: vi.fn(async () => "http://storage.local/download"),
    statObject: vi.fn(async () => null),
    readObject: vi.fn(async () => new Uint8Array()),
    deleteObject: vi.fn(async () => undefined),
  };
}

describe("BcfTopicService", () => {
  it("creates a component-linked topic for an editor", async () => {
    const topics = repository();
    const service = new BcfTopicService(topics, projects("editor"), storage(), {
      createId: () => topicId,
      now: () => now,
    });

    await expect(
      service.create("actor", {
        projectId,
        title: "Porte à vérifier",
        type: "issue",
        priority: "normal",
        component: {
          assetId: "ab64313e-7774-4294-a09d-f693d3cc68b8",
          expressId: 42,
          globalId: "0YvctA6Hn0pgmBdv0cPwH6",
        },
      }),
    ).resolves.toMatchObject({ id: topicId });
    expect(topics.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: topicId,
        createdBy: "actor",
        createdAt: now,
      }),
    );
  });

  it("allows viewers to read but not write topics", async () => {
    const service = new BcfTopicService(
      repository(),
      projects("viewer"),
      storage(),
    );

    await expect(service.list("actor", projectId)).resolves.toHaveLength(1);
    await expect(
      service.create("actor", {
        projectId,
        title: "Interdit",
        type: "issue",
        priority: "normal",
      }),
    ).rejects.toBeInstanceOf(BcfTopicAccessDeniedError);
  });

  it("does not add a comment to a topic outside the project", async () => {
    const topics = repository();
    topics.addComment = async () => null;
    const service = new BcfTopicService(topics, projects("owner"), storage());

    await expect(
      service.addComment("actor", {
        projectId,
        topicId,
        comment: "À contrôler",
      }),
    ).rejects.toBeInstanceOf(BcfTopicNotFoundError);
  });

  it("prepares a direct snapshot upload with a server-owned viewpoint GUID", async () => {
    const topics = repository();
    const objectStorage = storage();
    const service = new BcfTopicService(
      topics,
      projects("owner"),
      objectStorage,
      { createId: () => viewpointId, now: () => now },
    );

    const result = await service.beginViewpointCapture("actor", {
      projectId,
      topicId,
      data: {
        guid: "02609803-f2a6-4a1a-971c-bc579e28ea98",
        perspectiveCamera: {
          cameraViewPoint: { x: 1, y: 2, z: 3 },
          cameraDirection: { x: 0, y: 0, z: -1 },
          cameraUpVector: { x: 0, y: 1, z: 0 },
          fieldOfView: 50,
          aspectRatio: 16 / 9,
        },
      },
      targetDistance: 12,
      snapshot: { mediaType: "image/png", sizeBytes: 42 },
    });

    expect(result).toMatchObject({
      viewpointId,
      snapshotUpload: {
        uploadUrl: "http://storage.local/upload",
        requiredHeaders: { "content-type": "image/png" },
      },
    });
    expect(topics.createViewpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        id: viewpointId,
        data: expect.objectContaining({ guid: viewpointId }),
        snapshotObjectKey: `projects/${projectId}/bcf/${topicId}/viewpoints/${viewpointId}/snapshot.png`,
      }),
    );
  });

  it("rejects completion when the uploaded snapshot does not match", async () => {
    const topics = repository();
    topics.findViewpoint = vi.fn(async () => ({
      id: viewpointId,
      topicId,
      data: {
        guid: viewpointId,
        perspectiveCamera: {
          cameraViewPoint: { x: 1, y: 2, z: 3 },
          cameraDirection: { x: 0, y: 0, z: -1 },
          cameraUpVector: { x: 0, y: 1, z: 0 },
          fieldOfView: 50,
        },
      },
      targetDistance: 12,
      snapshotObjectKey: "snapshot.png",
      snapshotMediaType: "image/png",
      snapshotExpectedSize: 42,
      snapshotUploadedAt: null,
      authorName: "Erwan",
      createdAt: now.toISOString(),
    }));
    const service = new BcfTopicService(topics, projects("owner"), storage());

    await expect(
      service.completeViewpointCapture("actor", {
        projectId,
        topicId,
        viewpointId,
      }),
    ).rejects.toBeInstanceOf(BcfSnapshotVerificationError);
  });
});
