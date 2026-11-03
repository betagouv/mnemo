import { randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { bcfDefaults, createBcfTopicInputSchema } from "@mnemo/contracts/bcf";
import type { ObjectStorage } from "@mnemo/storage";
import type { ProjectRepository } from "@/server/projects/application/project-repository";
import type {
  BcfTopicRepository,
  StoredBcfTopic,
} from "./bcf-topic-repository";
import type { BcfArchiveCodec } from "./bcf-archive-codec";
import { BcfTopicService } from "./bcf-topic-service";
const projectId = randomUUID(),
  topicId = randomUUID(),
  viewId = randomUUID(),
  uploadId = randomUUID();
const now = new Date("2026-11-03T12:00:00Z");
function topic(): StoredBcfTopic {
  return {
    id: topicId,
    bcfGuid: topicId,
    projectId,
    number: 1,
    title: "Porte",
    description: null,
    type: "Issue",
    status: "Open",
    priority: "Normal",
    authorName: "Erwan",
    authorEmail: "author@example.fr",
    modifiedAuthor: null,
    assignedTo: null,
    dueDate: null,
    labels: [],
    components: [],
    comments: [],
    viewpoints: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
function setup(role: "owner" | "editor" | "viewer" = "editor") {
  const topics: BcfTopicRepository = {
    list: vi.fn(async () => [topic()]),
    find: vi.fn(async () => topic()),
    summaries: vi.fn(async () => []),
    markers: vi.fn(async () => []),
    members: vi.fn(async () => []),
    options: vi.fn(async () => ({
      statuses: [...bcfDefaults.statuses],
      types: [...bcfDefaults.types],
      priorities: [...bcfDefaults.priorities],
    })),
    findSnapshot: vi.fn(async () => null),
    update: vi.fn(async () => topic()),
    protectSnapshot: vi.fn(async () => {}),
    prepareUpload: vi.fn(async () => {}),
    findUpload: vi.fn(async () => null),
    create: vi.fn(async () => topic()),
    importTopics: vi.fn(
      async (input: Parameters<BcfTopicRepository["importTopics"]>[0]) => ({
        insertedTopicIds: input.map((topic) => topic.id),
        skippedBcfGuids: [],
      }),
    ),
    addComment: vi.fn(async () => topic()),
    updateStatus: vi.fn(async () => topic()),
    createViewpoint: vi.fn(async () => topic()),
  };
  const projects = {
    findForActor: vi.fn(async () => ({
      id: projectId,
      title: "Projet",
      role,
      createdAt: now,
      updatedAt: now,
      address: null,
      description: null,
    })),
  } as unknown as ProjectRepository;
  const storage = {
    createUploadUrl: vi.fn(async () => "http://storage.local/upload"),
    createDownloadUrl: vi.fn(async () => "http://storage.local/read"),
    statObject: vi.fn(async () => null),
    readObject: vi.fn(async () => new Uint8Array()),
    writeObject: vi.fn(async () => {}),
    deleteObject: vi.fn(async () => {}),
  } as unknown as ObjectStorage;
  const archives: BcfArchiveCodec = {
    decode: vi.fn(async () => ({
      version: "3.0" as const,
      projectName: null,
      topics: [],
      warnings: [],
    })),
    encode: vi.fn(async () => new Uint8Array([80, 75])),
  };
  return {
    topics,
    projects,
    storage,
    archives,
    service: new BcfTopicService(topics, projects, storage, archives, {
      now: () => now,
      createId: () => viewId,
    }),
  };
}
const draft = {
  data: {
    guid: viewId,
    perspectiveCamera: {
      cameraViewPoint: { x: 1, y: 2, z: 3 },
      cameraDirection: { x: 0, y: 1, z: 0 },
      cameraUpVector: { x: 0, y: 0, z: 1 },
      fieldOfView: 60,
      aspectRatio: 1.5,
    },
  },
  targetDistance: 20,
  uploadId,
};
describe("BCF workspace service", () => {
  it("creates an editor's topic with explicit multi-object associations", async () => {
    const { service, topics } = setup();
    const input = createBcfTopicInputSchema.parse({
      projectId,
      title: "Porte",
      components: [
        {
          assetId: randomUUID(),
          globalId: "0YvctA6Hn0pgmBdv0cPwH6",
          expressId: 42,
        },
        {
          assetId: randomUUID(),
          globalId: "1YvctA6Hn0pgmBdv0cPwH6",
          expressId: 43,
        },
      ],
    });
    await service.create("actor", input);
    expect(topics.create).toHaveBeenCalledWith(
      expect.objectContaining({
        components: input.components,
        createdBy: "actor",
      }),
    );
  });
  it("denies readers every mutation and snapshot preparation", async () => {
    const { service, topics } = setup("viewer");
    await expect(
      service.create(
        "actor",
        createBcfTopicInputSchema.parse({ projectId, title: "Porte" }),
      ),
    ).rejects.toThrow();
    await expect(
      service.addComment("actor", { projectId, topicId, comment: "test" }),
    ).rejects.toThrow();
    await expect(
      service.saveViewpoint("actor", { projectId, topicId, viewpoint: draft }),
    ).rejects.toThrow();
    await expect(
      service.prepareSnapshot("actor", {
        projectId,
        mediaType: "image/png",
        sizeBytes: 8,
      }),
    ).rejects.toThrow();
    expect(topics.create).not.toHaveBeenCalled();
  });
  it("does not expose another project's detail", async () => {
    const { service, projects, topics } = setup();
    vi.mocked(projects.findForActor).mockResolvedValue(undefined);
    await expect(
      service.detail("outsider", projectId, topicId),
    ).rejects.toThrow();
    expect(topics.find).not.toHaveBeenCalled();
  });
  it("rejects foreign, expired or missing upload receipts before creating a topic", async () => {
    const { service, topics } = setup();
    await expect(
      service.create(
        "actor",
        createBcfTopicInputSchema.parse({
          projectId,
          title: "Porte",
          viewpoint: draft,
        }),
      ),
    ).rejects.toThrow("expiré");
    expect(topics.findUpload).toHaveBeenCalledWith(
      projectId,
      "actor",
      uploadId,
    );
    expect(topics.create).not.toHaveBeenCalled();
  });
  it("verifies image bytes and finalizes the topic with its viewpoint", async () => {
    const { service, topics, storage } = setup();
    vi.mocked(topics.findUpload).mockResolvedValue({
      id: uploadId,
      projectId,
      actorId: "actor",
      objectKey: "pending",
      mediaType: "image/png",
      sizeBytes: 8,
      expiresAt: new Date(now.getTime() + 10000),
    });
    vi.mocked(storage.statObject).mockResolvedValue({
      contentLength: 8,
      contentType: "image/png",
      etag: null,
    });
    vi.mocked(storage.readObject).mockResolvedValue(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    await service.create(
      "actor",
      createBcfTopicInputSchema.parse({
        projectId,
        title: "Porte",
        viewpoint: draft,
      }),
    );
    expect(topics.create).toHaveBeenCalledWith(
      expect.objectContaining({
        preparedViewpoint: expect.objectContaining({
          uploadId,
          snapshotExpectedSize: 8,
        }),
      }),
    );
  });
  it("cleans the final snapshot when the transaction fails", async () => {
    const { service, topics, storage } = setup();
    vi.mocked(topics.findUpload).mockResolvedValue({
      id: uploadId,
      projectId,
      actorId: "actor",
      objectKey: "pending",
      mediaType: "image/png",
      sizeBytes: 8,
      expiresAt: new Date(now.getTime() + 10000),
    });
    vi.mocked(storage.statObject).mockResolvedValue({
      contentLength: 8,
      contentType: "image/png",
      etag: null,
    });
    vi.mocked(storage.readObject).mockResolvedValue(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    vi.mocked(topics.create).mockRejectedValue(new Error("rollback"));
    await expect(
      service.create(
        "actor",
        createBcfTopicInputSchema.parse({
          projectId,
          title: "Porte",
          viewpoint: draft,
        }),
      ),
    ).rejects.toThrow("rollback");
    expect(storage.deleteObject).toHaveBeenCalled();
  });
  it("rejects renamed non-images despite matching S3 metadata", async () => {
    const { service, topics, storage } = setup();
    vi.mocked(topics.findUpload).mockResolvedValue({
      id: uploadId,
      projectId,
      actorId: "actor",
      objectKey: "pending",
      mediaType: "image/png",
      sizeBytes: 8,
      expiresAt: new Date(now.getTime() + 10000),
    });
    vi.mocked(storage.statObject).mockResolvedValue({
      contentLength: 8,
      contentType: "image/png",
      etag: null,
    });
    vi.mocked(storage.readObject).mockResolvedValue(new Uint8Array(8));
    await expect(
      service.create(
        "actor",
        createBcfTopicInputSchema.parse({
          projectId,
          title: "Porte",
          viewpoint: draft,
        }),
      ),
    ).rejects.toThrow("image valide");
    expect(topics.create).not.toHaveBeenCalled();
  });
  it("uses summaries without signing all screenshots", async () => {
    const { service, storage, topics } = setup();
    await service.summaries("actor", projectId);
    expect(topics.summaries).toHaveBeenCalledWith(projectId);
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("BCF snapshot access", () => {
  it("checks project permissions before looking up any image", async () => {
    const { service, projects, topics, storage } = setup();
    vi.mocked(projects.findForActor).mockResolvedValue(undefined);
    await expect(
      service.snapshotUrl("outsider", projectId, topicId, viewId),
    ).rejects.toThrow();
    expect(topics.findSnapshot).not.toHaveBeenCalled();
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it("issues a fresh link for each authorized image request", async () => {
    const { service, topics, storage } = setup();
    vi.mocked(topics.findSnapshot).mockResolvedValue({
      objectKey: "private/capture.png",
    });
    await service.snapshotUrl("actor", projectId, topicId, viewId);
    await service.snapshotUrl("actor", projectId, topicId, viewId);
    expect(topics.findSnapshot).toHaveBeenCalledWith(
      projectId,
      topicId,
      viewId,
    );
    expect(storage.createDownloadUrl).toHaveBeenCalledTimes(2);
  });
  it("does not sign a missing or unrelated viewpoint", async () => {
    const { service, storage } = setup();
    await expect(
      service.snapshotUrl("actor", projectId, topicId, viewId),
    ).rejects.toThrow("introuvable");
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});
