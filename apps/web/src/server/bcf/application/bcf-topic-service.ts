import { exportBcfArchive, importBcfArchive } from "./bcf-archives";
import { deleteSnapshotsBestEffort } from "./bcf-snapshot-storage";
import { randomUUID } from "node:crypto";
import type {
  AddBcfCommentInput,
  CreateBcfTopicInput,
  UpdateBcfTopicStatusInput,
  UpdateBcfTopicInput,
  BcfViewpointDraft,
  PrepareBcfSnapshotInput,
  SaveBcfViewpointInput,
} from "@mnemo/contracts/bcf";
import {
  hasProjectPermission,
  type ProjectPermission,
} from "@mnemo/domain/project";
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
import type { BcfArchiveCodec } from "./bcf-archive-codec";
import type {
  BcfTopicRepository,
  StoredBcfTopic,
  StoredBcfViewpoint,
  PreparedBcfViewpoint,
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
    private readonly archives: BcfArchiveCodec,
    options: BcfTopicServiceOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async markers(actorId: string, projectId: string) {
    await this.requireProject(actorId, projectId, "bcf:read");
    return this.topics.markers(projectId);
  }
  async summaries(actorId: string, projectId: string) {
    await this.requireProject(actorId, projectId, "bcf:read");
    return this.topics.summaries(projectId);
  }
  async detail(actorId: string, projectId: string, topicId: string) {
    await this.requireProject(actorId, projectId, "bcf:read");
    const topic = await this.topics.find(projectId, topicId);
    if (!topic) throw new BcfTopicNotFoundError("Remarque introuvable.");
    return this.exposeTopic(topic);
  }
  async workspace(actorId: string, projectId: string) {
    await this.requireProject(actorId, projectId, "bcf:read");
    const [options, members] = await Promise.all([
      this.topics.options(projectId),
      this.topics.members(projectId),
    ]);
    return { options, members };
  }
  async snapshotUrl(
    actorId: string,
    projectId: string,
    topicId: string,
    viewpointId: string,
  ) {
    await this.requireProject(actorId, projectId, "bcf:read");
    const snapshot = await this.topics.findSnapshot(
      projectId,
      topicId,
      viewpointId,
    );
    if (!snapshot) throw new BcfTopicNotFoundError("Capture introuvable.");
    return this.storage.createDownloadUrl({
      objectKey: snapshot.objectKey,
      expiresInSeconds: snapshotDownloadTtlSeconds,
    });
  }
  async update(actorId: string, input: UpdateBcfTopicInput) {
    await this.requireProject(actorId, input.projectId, "bcf:topic:update");
    const member = (await this.topics.members(input.projectId)).find(
      (member) => member.id === actorId,
    );
    const topic = await this.topics.update({
      ...input,
      modifiedAuthor: member?.email ?? actorId,
      updatedAt: this.now(),
    });
    if (!topic) throw new BcfTopicNotFoundError("Remarque introuvable.");
    return this.exposeTopic(topic);
  }
  async create(actorId: string, input: CreateBcfTopicInput) {
    await this.requireProject(actorId, input.projectId, "bcf:topic:create");
    const id = this.createId();
    const view = await this.prepareViewpoint(
      actorId,
      input.projectId,
      id,
      input.viewpoint,
    );
    let topic: StoredBcfTopic;
    try {
      topic = await this.topics.create({
        ...input,
        id,
        createdBy: actorId,
        createdAt: this.now(),
        preparedViewpoint: view,
      });
    } catch (error) {
      await this.discardPrepared(view);
      throw error;
    }
    return this.exposeTopic(topic);
  }
  async addComment(actorId: string, input: AddBcfCommentInput) {
    await this.requireProject(actorId, input.projectId, "bcf:comment:create");
    const view = await this.prepareViewpoint(
      actorId,
      input.projectId,
      input.topicId,
      input.viewpoint,
    );
    let topic: StoredBcfTopic | null;
    try {
      topic = await this.topics.addComment({
        ...input,
        id: this.createId(),
        authorId: actorId,
        createdAt: this.now(),
        preparedViewpoint: view,
      });
      if (!topic) throw new BcfTopicNotFoundError("Remarque introuvable.");
    } catch (error) {
      await this.discardPrepared(view);
      throw error;
    }
    return this.exposeTopic(topic);
  }
  async prepareSnapshot(actorId: string, input: PrepareBcfSnapshotInput) {
    // Uploading a draft never bypasses the permission of the eventual operation.
    const project = await this.requireProject(
      actorId,
      input.projectId,
      "bcf:read",
    );
    if (
      !["bcf:topic:create", "bcf:comment:create", "bcf:viewpoint:create"].some(
        (permission) =>
          hasProjectPermission(project, permission as ProjectPermission),
      )
    )
      throw new BcfTopicAccessDeniedError("Ajout de capture non autorisé.");
    const id = this.createId();
    const objectKey = `projects/${input.projectId}/bcf/uploads/${id}.${input.mediaType === "image/png" ? "png" : "jpg"}`;
    const expiresAt = new Date(
      this.now().getTime() + snapshotUploadTtlSeconds * 1000,
    );
    await this.topics.prepareUpload({
      id,
      projectId: input.projectId,
      actorId,
      objectKey,
      mediaType: input.mediaType,
      sizeBytes: input.sizeBytes,
      expiresAt,
    });
    return {
      uploadId: id,
      uploadUrl: await this.storage.createUploadUrl({
        objectKey,
        contentType: input.mediaType,
        expiresInSeconds: snapshotUploadTtlSeconds,
      }),
      requiredHeaders: { "content-type": input.mediaType },
      expiresAt: expiresAt.toISOString(),
    };
  }
  async saveViewpoint(actorId: string, input: SaveBcfViewpointInput) {
    await this.requireProject(actorId, input.projectId, "bcf:viewpoint:create");
    const view = await this.prepareViewpoint(
      actorId,
      input.projectId,
      input.topicId,
      input.viewpoint,
    );
    if (!view) throw new BcfSnapshotVerificationError("Vue manquante.");
    let topic: StoredBcfTopic | null;
    try {
      topic = await this.topics.createViewpoint({
        ...view,
        projectId: input.projectId,
        topicId: input.topicId,
      });
      if (!topic) throw new BcfTopicNotFoundError("Remarque introuvable.");
    } catch (error) {
      await this.discardPrepared(view);
      throw error;
    }
    return this.exposeTopic(topic);
  }
  private async prepareViewpoint(
    actorId: string,
    projectId: string,
    topicId: string,
    draft?: BcfViewpointDraft,
  ): Promise<PreparedBcfViewpoint | undefined> {
    if (!draft) return;
    const id = this.createId();
    const upload = draft.uploadId
      ? await this.topics.findUpload(projectId, actorId, draft.uploadId)
      : null;
    if (draft.uploadId && (!upload || upload.expiresAt <= this.now()))
      throw new BcfSnapshotVerificationError(
        "La capture a expiré. Réessayez l’enregistrement.",
      );
    const key = upload
      ? buildBcfViewpointSnapshotKey({
          projectId,
          topicId,
          viewpointId: id,
          mediaType: upload.mediaType as "image/png" | "image/jpeg",
        })
      : null;
    if (upload && key) {
      const object = await this.storage.statObject(upload.objectKey);
      if (
        !object ||
        object.contentLength !== upload.sizeBytes ||
        object.contentType !== upload.mediaType
      )
        throw new BcfSnapshotVerificationError(
          "La capture n’a pas été reçue intégralement.",
        );
      const bytes = await this.storage.readObject(upload.objectKey);
      const png =
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71 &&
        bytes[4] === 13 &&
        bytes[5] === 10 &&
        bytes[6] === 26 &&
        bytes[7] === 10;
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (
        bytes.byteLength !== upload.sizeBytes ||
        !(upload.mediaType === "image/png" ? png : jpeg)
      )
        throw new BcfSnapshotVerificationError(
          "Le fichier reçu n’est pas une image valide.",
        );
      // A crash between object upload and DB commit must not leave an orphan.
      await this.topics.protectSnapshot(
        id,
        key,
        new Date(this.now().getTime() + 60 * 60 * 1000),
      );
      await this.storage.writeObject({
        objectKey: key,
        contentType: upload.mediaType,
        body: bytes,
      });
    }
    return {
      id,
      data: { ...draft.data, guid: id },
      targetDistance: draft.targetDistance,
      snapshotObjectKey: key,
      snapshotMediaType: upload?.mediaType ?? null,
      snapshotExpectedSize: upload?.sizeBytes ?? null,
      createdBy: actorId,
      createdAt: this.now(),
      uploadId: upload?.id,
    };
  }
  private async discardPrepared(view?: PreparedBcfViewpoint) {
    if (view?.snapshotObjectKey)
      await deleteSnapshotsBestEffort(this.storage, [view.snapshotObjectKey]);
  }

  async updateStatus(actorId: string, input: UpdateBcfTopicStatusInput) {
    await this.requireProject(actorId, input.projectId, "bcf:topic:update");
    const topic = await this.topics.updateStatus({
      ...input,
      updatedAt: this.now(),
    });
    if (!topic) throw new BcfTopicNotFoundError("BCF topic was not found");
    return this.exposeTopic(topic);
  }

  async exportArchive(actorId: string, projectId: string) {
    const project = await this.requireProject(actorId, projectId, "bcf:read");
    return exportBcfArchive(this.archiveContext(), project);
  }

  async importArchive(actorId: string, projectId: string, bytes: Uint8Array) {
    await this.requireProject(actorId, projectId, "bcf:topic:create");
    return importBcfArchive(this.archiveContext(), actorId, projectId, bytes);
  }

  private archiveContext() {
    return {
      topics: this.topics,
      storage: this.storage,
      archives: this.archives,
      now: this.now,
      createId: this.createId,
    };
  }

  private async requireProject(
    actorId: string,
    projectId: string,
    permission: ProjectPermission,
  ) {
    const project = await this.projects.findForActor(actorId, projectId);
    if (!project || !hasProjectPermission(project, permission)) {
      throw new BcfTopicAccessDeniedError(
        "BCF topics are not available to this actor",
      );
    }
    return project;
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
      authorEmail: topic.authorEmail,
      modifiedAuthor: topic.modifiedAuthor,
      number: topic.number,
      assignedTo: topic.assignedTo,
      dueDate: topic.dueDate,
      labels: topic.labels,
      components: topic.components,
      comments: topic.comments.map((comment) => ({
        id: comment.id,
        authorName: comment.authorName,
        comment: comment.comment,
        createdAt: comment.createdAt,
        viewpointBcfGuid: comment.viewpointBcfGuid,
      })),
      viewpoints: await Promise.all(
        topic.viewpoints.map((viewpoint) =>
          this.exposeViewpoint(topic.projectId, viewpoint),
        ),
      ),
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
    };
  }

  private async exposeViewpoint(
    projectId: string,
    viewpoint: StoredBcfViewpoint,
  ) {
    return {
      id: viewpoint.id,
      topicId: viewpoint.topicId,
      data: viewpoint.data,
      targetDistance: viewpoint.targetDistance,
      authorName: viewpoint.authorName,
      createdAt: viewpoint.createdAt,
      snapshotUrl:
        viewpoint.snapshotObjectKey && viewpoint.snapshotUploadedAt
          ? `/api/projects/${projectId}/bcf/topics/${viewpoint.topicId}/viewpoints/${viewpoint.id}/snapshot`
          : null,
    };
  }
}
