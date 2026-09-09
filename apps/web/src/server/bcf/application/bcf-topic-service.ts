import { randomUUID } from "node:crypto";

import type {
  AddBcfCommentInput,
  BeginBcfViewpointCaptureInput,
  CompleteBcfViewpointCaptureInput,
  CreateBcfTopicInput,
  UpdateBcfTopicStatusInput,
} from "@mnemo/contracts/bcf";
import { hasProjectPermission } from "@mnemo/domain/project";
import {
  buildBcfViewpointSnapshotKey,
  type ObjectStorage,
} from "@mnemo/storage";

import type { ProjectRepository } from "@/server/projects/application/project-repository";

import {
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
  BcfSnapshotVerificationError,
} from "./bcf-topic-errors";
import type {
  BcfTopicRepository,
  StoredBcfTopic,
  StoredBcfViewpoint,
} from "./bcf-topic-repository";

const snapshotUploadTtlSeconds = 10 * 60;
const snapshotDownloadTtlSeconds = 5 * 60;

export type BcfTopicServiceOptions = {
  createId?: () => string;
  now?: () => Date;
};

export class BcfTopicService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly topics: BcfTopicRepository,
    private readonly projects: ProjectRepository,
    private readonly storage: ObjectStorage,
    options: BcfTopicServiceOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async list(actorId: string, projectId: string) {
    await this.requireProject(actorId, projectId, false);
    return Promise.all(
      (await this.topics.list(projectId)).map((topic) =>
        this.exposeTopic(topic),
      ),
    );
  }

  async create(actorId: string, input: CreateBcfTopicInput) {
    await this.requireProject(actorId, input.projectId, true);
    return this.exposeTopic(
      await this.topics.create({
        ...input,
        id: this.createId(),
        createdBy: actorId,
        createdAt: this.now(),
      }),
    );
  }

  async addComment(actorId: string, input: AddBcfCommentInput) {
    await this.requireProject(actorId, input.projectId, true);
    const topic = await this.topics.addComment({
      ...input,
      id: this.createId(),
      authorId: actorId,
      createdAt: this.now(),
    });
    if (!topic) throw new BcfTopicNotFoundError("BCF topic was not found");
    return this.exposeTopic(topic);
  }

  async updateStatus(actorId: string, input: UpdateBcfTopicStatusInput) {
    await this.requireProject(actorId, input.projectId, true);
    const topic = await this.topics.updateStatus({
      ...input,
      updatedAt: this.now(),
    });
    if (!topic) throw new BcfTopicNotFoundError("BCF topic was not found");
    return this.exposeTopic(topic);
  }

  async beginViewpointCapture(
    actorId: string,
    input: BeginBcfViewpointCaptureInput,
  ) {
    await this.requireProject(actorId, input.projectId, true);
    const id = this.createId();
    const createdAt = this.now();
    const expiresAt = new Date(
      createdAt.getTime() + snapshotUploadTtlSeconds * 1_000,
    );
    const snapshotObjectKey = input.snapshot
      ? buildBcfViewpointSnapshotKey({
          projectId: input.projectId,
          topicId: input.topicId,
          viewpointId: id,
          mediaType: input.snapshot.mediaType,
        })
      : null;
    const uploadUrl =
      input.snapshot && snapshotObjectKey
        ? await this.storage.createUploadUrl({
            objectKey: snapshotObjectKey,
            contentType: input.snapshot.mediaType,
            expiresInSeconds: snapshotUploadTtlSeconds,
          })
        : null;
    const topic = await this.topics.createViewpoint({
      id,
      projectId: input.projectId,
      topicId: input.topicId,
      data: { ...input.data, guid: id },
      targetDistance: input.targetDistance,
      snapshotObjectKey,
      snapshotMediaType: input.snapshot?.mediaType ?? null,
      snapshotExpectedSize: input.snapshot?.sizeBytes ?? null,
      createdBy: actorId,
      createdAt,
    });
    if (!topic) throw new BcfTopicNotFoundError("BCF topic was not found");

    return {
      topic: await this.exposeTopic(topic),
      viewpointId: id,
      snapshotUpload:
        uploadUrl && input.snapshot
          ? {
              uploadUrl,
              requiredHeaders: { "content-type": input.snapshot.mediaType },
              expiresAt: expiresAt.toISOString(),
            }
          : null,
    };
  }

  async completeViewpointCapture(
    actorId: string,
    input: CompleteBcfViewpointCaptureInput,
  ) {
    await this.requireProject(actorId, input.projectId, true);
    const viewpoint = await this.topics.findViewpoint(
      input.projectId,
      input.topicId,
      input.viewpointId,
    );
    if (!viewpoint) {
      throw new BcfTopicNotFoundError("BCF viewpoint was not found");
    }
    if (!viewpoint.snapshotObjectKey || !viewpoint.snapshotExpectedSize) {
      throw new BcfSnapshotVerificationError(
        "This viewpoint has no pending snapshot upload",
      );
    }

    if (!viewpoint.snapshotUploadedAt) {
      const object = await this.storage.statObject(viewpoint.snapshotObjectKey);
      if (
        !object ||
        object.contentLength !== viewpoint.snapshotExpectedSize ||
        (viewpoint.snapshotMediaType &&
          object.contentType !== viewpoint.snapshotMediaType)
      ) {
        throw new BcfSnapshotVerificationError(
          "The viewpoint snapshot is missing or does not match its upload",
        );
      }
    }

    const topic = await this.topics.markViewpointSnapshotUploaded({
      ...input,
      uploadedAt: this.now(),
    });
    if (!topic) throw new BcfTopicNotFoundError("BCF topic was not found");
    return this.exposeTopic(topic);
  }

  private async requireProject(
    actorId: string,
    projectId: string,
    write: boolean,
  ) {
    const project = await this.projects.findForActor(actorId, projectId);
    if (
      !project ||
      (write && !hasProjectPermission(project.role, "bcf:write"))
    ) {
      throw new BcfTopicAccessDeniedError(
        write
          ? "The actor cannot update BCF topics in this project"
          : "BCF topics are not available to this actor",
      );
    }
    return project;
  }

  private async exposeTopic(topic: StoredBcfTopic) {
    return {
      ...topic,
      viewpoints: await Promise.all(
        topic.viewpoints.map((viewpoint) => this.exposeViewpoint(viewpoint)),
      ),
    };
  }

  private async exposeViewpoint(viewpoint: StoredBcfViewpoint) {
    return {
      id: viewpoint.id,
      topicId: viewpoint.topicId,
      data: viewpoint.data,
      targetDistance: viewpoint.targetDistance,
      authorName: viewpoint.authorName,
      createdAt: viewpoint.createdAt,
      snapshotUrl:
        viewpoint.snapshotObjectKey && viewpoint.snapshotUploadedAt
          ? await this.storage.createDownloadUrl({
              objectKey: viewpoint.snapshotObjectKey,
              expiresInSeconds: snapshotDownloadTtlSeconds,
            })
          : null,
    };
  }
}
