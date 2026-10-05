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
  BcfArchiveInvalidError,
  BcfArchiveTooLargeError,
  BcfTopicAccessDeniedError,
  BcfTopicNotFoundError,
  BcfSnapshotVerificationError,
} from "./bcf-topic-errors";
import type { BcfArchiveCodec } from "./bcf-archive-codec";
import type {
  BcfTopicRepository,
  StoredBcfTopic,
  StoredBcfViewpoint,
} from "./bcf-topic-repository";

const snapshotUploadTtlSeconds = 10 * 60;
const snapshotDownloadTtlSeconds = 5 * 60;
const maxBcfArchiveBytes = 50 * 1024 * 1024;

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
    private readonly archives: BcfArchiveCodec,
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

  async exportArchive(actorId: string, projectId: string) {
    const project = await this.requireProject(actorId, projectId, false);
    const topics = await this.topics.list(projectId);
    const exportTopics = await Promise.all(
      topics.map(async (topic) => ({
        guid: topic.bcfGuid,
        title: topic.title,
        description: topic.description,
        type: topic.type,
        status: topic.status,
        priority: topic.priority,
        authorName: topic.authorName,
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
        componentGlobalIds: topic.components.map(
          (component) => component.globalId,
        ),
        comments: topic.comments.map((comment) => ({
          guid: comment.bcfGuid,
          authorName: comment.authorName,
          comment: comment.comment,
          createdAt: comment.createdAt,
          viewpointGuid: comment.viewpointBcfGuid,
        })),
        viewpoints: await Promise.all(
          topic.viewpoints.map(async (viewpoint) => ({
            guid: viewpoint.bcfGuid,
            data: { ...viewpoint.data, guid: viewpoint.bcfGuid },
            targetDistance: viewpoint.targetDistance,
            snapshot: await this.readSnapshotForExport(viewpoint),
          })),
        ),
      })),
    );

    return {
      bytes: await this.archives.encode({
        projectId,
        projectName: project.title,
        topics: exportTopics,
      }),
      fileName: `${this.safeFileName(project.title)}.bcfzip`,
    };
  }

  async importArchive(actorId: string, projectId: string, bytes: Uint8Array) {
    await this.requireProject(actorId, projectId, true);
    if (bytes.byteLength > maxBcfArchiveBytes) {
      throw new BcfArchiveTooLargeError(
        "L’archive BCF dépasse la limite de 50 Mio.",
      );
    }

    let archive: Awaited<ReturnType<BcfArchiveCodec["decode"]>>;
    try {
      archive = await this.archives.decode(bytes);
    } catch (error) {
      if (error instanceof BcfArchiveTooLargeError) throw error;
      throw new BcfArchiveInvalidError(
        error instanceof Error
          ? error.message
          : "L’archive BCF n’a pas pu être lue.",
      );
    }

    const importedAt = this.now();
    const writtenSnapshotKeys: string[] = [];
    const records = archive.topics.map((topic) => {
      const topicId = this.createId();
      const createdAt = this.safeDate(topic.createdAt, importedAt);
      const updatedAt = this.safeDate(topic.updatedAt, createdAt);

      return {
        id: topicId,
        bcfGuid: topic.guid,
        projectId,
        title: topic.title.slice(0, 255),
        description: topic.description?.slice(0, 10_000) ?? null,
        type: topic.type,
        status: topic.status,
        priority: topic.priority,
        createdBy: actorId,
        externalAuthor: topic.authorName.slice(0, 320),
        createdAt,
        updatedAt,
        components: topic.componentGlobalIds.map((globalId) => ({
          id: this.createId(),
          globalId: globalId.slice(0, 64),
        })),
        comments: topic.comments.map((comment) => ({
          id: this.createId(),
          bcfGuid: comment.guid,
          externalAuthor: comment.authorName.slice(0, 320),
          comment: comment.comment.slice(0, 10_000),
          viewpointBcfGuid: comment.viewpointGuid,
          createdAt: this.safeDate(comment.createdAt, createdAt),
        })),
        viewpoints: topic.viewpoints.map((viewpoint) => {
          const viewpointId = this.createId();
          const snapshotObjectKey = viewpoint.snapshot
            ? buildBcfViewpointSnapshotKey({
                projectId,
                topicId,
                viewpointId,
                mediaType: viewpoint.snapshot.mediaType,
              })
            : null;
          return {
            id: viewpointId,
            bcfGuid: viewpoint.guid,
            data: { ...viewpoint.data, guid: viewpoint.guid },
            targetDistance: viewpoint.targetDistance,
            snapshotObjectKey,
            snapshotMediaType: viewpoint.snapshot?.mediaType ?? null,
            snapshotExpectedSize: viewpoint.snapshot?.bytes.byteLength ?? null,
            snapshotUploadedAt: viewpoint.snapshot ? importedAt : null,
            externalAuthor: topic.authorName.slice(0, 320),
            createdAt,
            snapshotBytes: viewpoint.snapshot?.bytes ?? null,
          };
        }),
      };
    });

    try {
      for (const topic of records) {
        for (const viewpoint of topic.viewpoints) {
          if (!viewpoint.snapshotObjectKey || !viewpoint.snapshotBytes)
            continue;
          await this.storage.writeObject({
            objectKey: viewpoint.snapshotObjectKey,
            contentType: viewpoint.snapshotMediaType ?? "image/png",
            body: viewpoint.snapshotBytes,
          });
          writtenSnapshotKeys.push(viewpoint.snapshotObjectKey);
        }
      }

      const imported = await this.topics.importTopics(
        records.map((topic) => ({
          ...topic,
          viewpoints: topic.viewpoints.map((viewpoint) => ({
            id: viewpoint.id,
            bcfGuid: viewpoint.bcfGuid,
            data: viewpoint.data,
            targetDistance: viewpoint.targetDistance,
            snapshotObjectKey: viewpoint.snapshotObjectKey,
            snapshotMediaType: viewpoint.snapshotMediaType,
            snapshotExpectedSize: viewpoint.snapshotExpectedSize,
            snapshotUploadedAt: viewpoint.snapshotUploadedAt,
            externalAuthor: viewpoint.externalAuthor,
            createdAt: viewpoint.createdAt,
          })),
        })),
      );
      const insertedTopicIds = new Set(imported.insertedTopicIds);
      const skippedSnapshotKeys = records.flatMap((topic) =>
        insertedTopicIds.has(topic.id)
          ? []
          : topic.viewpoints.flatMap((viewpoint) =>
              viewpoint.snapshotObjectKey ? [viewpoint.snapshotObjectKey] : [],
            ),
      );
      await this.deleteSnapshotsBestEffort(skippedSnapshotKeys);

      const insertedRecords = records.filter((topic) =>
        insertedTopicIds.has(topic.id),
      );

      return {
        topics: await this.list(actorId, projectId),
        imported: {
          topics: insertedRecords.length,
          comments: insertedRecords.reduce(
            (total, topic) => total + topic.comments.length,
            0,
          ),
          viewpoints: insertedRecords.reduce(
            (total, topic) => total + topic.viewpoints.length,
            0,
          ),
          snapshots: insertedRecords.reduce(
            (total, topic) =>
              total +
              topic.viewpoints.filter((viewpoint) => viewpoint.snapshotBytes)
                .length,
            0,
          ),
        },
        skippedTopics: imported.skippedBcfGuids.length,
        warnings: archive.warnings,
      };
    } catch (error) {
      await this.deleteSnapshotsBestEffort(writtenSnapshotKeys);
      throw error;
    }
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

  private safeDate(value: string | null, fallback: Date) {
    if (!value) return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  private safeFileName(name: string) {
    const normalized = name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return normalized || "projet-mnemo";
  }

  private async readSnapshotForExport(viewpoint: StoredBcfViewpoint): Promise<{
    bytes: Uint8Array;
    mediaType: "image/png" | "image/jpeg";
  } | null> {
    if (
      !viewpoint.snapshotObjectKey ||
      !viewpoint.snapshotUploadedAt ||
      (viewpoint.snapshotMediaType !== "image/png" &&
        viewpoint.snapshotMediaType !== "image/jpeg")
    ) {
      return null;
    }

    try {
      return {
        bytes: await this.storage.readObject(viewpoint.snapshotObjectKey),
        mediaType: viewpoint.snapshotMediaType,
      };
    } catch {
      return null;
    }
  }

  private async deleteSnapshotsBestEffort(objectKeys: string[]) {
    await Promise.allSettled(
      objectKeys.map((objectKey) => this.storage.deleteObject(objectKey)),
    );
  }

  private async exposeTopic(topic: StoredBcfTopic) {
    return {
      id: topic.id,
      projectId: topic.projectId,
      title: topic.title,
      description: topic.description,
      type: topic.type,
      status: topic.status,
      priority: topic.priority,
      authorName: topic.authorName,
      components: topic.components,
      comments: topic.comments.map((comment) => ({
        id: comment.id,
        authorName: comment.authorName,
        comment: comment.comment,
        createdAt: comment.createdAt,
      })),
      viewpoints: await Promise.all(
        topic.viewpoints.map((viewpoint) => this.exposeViewpoint(viewpoint)),
      ),
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
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
