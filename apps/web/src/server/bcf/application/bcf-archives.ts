import {
  buildBcfViewpointSnapshotKey,
  type ObjectStorage,
} from "@mnemo/storage";
import {
  BcfArchiveInvalidError,
  BcfArchiveTooLargeError,
} from "./bcf-topic-errors";
import type { BcfArchiveCodec } from "./bcf-archive-codec";
import type { BcfTopicRepository } from "./bcf-topic-repository";
import {
  readSnapshotForExport,
  deleteSnapshotsBestEffort,
} from "./bcf-snapshot-storage";
const maxBcfArchiveBytes = 50 * 1024 * 1024;
export type BcfArchiveContext = {
  topics: BcfTopicRepository;
  storage: ObjectStorage;
  archives: BcfArchiveCodec;
  now: () => Date;
  createId: () => string;
};
export async function exportBcfArchive(
  context: BcfArchiveContext,
  project: { id: string; title: string },
) {
  const projectId = project.id;
  const topics = await context.topics.list(projectId);
  const exportTopics = await Promise.all(
    topics.map(async (topic) => ({
      metadata: topic.exchangeMetadata,
      guid: topic.bcfGuid,
      title: topic.title,
      description: topic.description,
      type: topic.type,
      status: topic.status,
      priority: topic.priority,
      authorName: topic.authorEmail,
      assignedTo: topic.assignedTo,
      dueDate: topic.dueDate,
      labels: topic.labels,
      modifiedAuthor: topic.modifiedAuthor,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      componentGlobalIds: topic.components.map(
        (component) => component.globalId,
      ),
      comments: topic.comments.map((comment) => ({
        guid: comment.bcfGuid,
        authorName: comment.authorEmail,
        comment: comment.comment,
        createdAt: comment.createdAt,
        viewpointGuid: comment.viewpointBcfGuid,
      })),
      viewpoints: await Promise.all(
        topic.viewpoints.map(async (viewpoint) => ({
          guid: viewpoint.bcfGuid,
          data: { ...viewpoint.data, guid: viewpoint.bcfGuid },
          targetDistance: viewpoint.targetDistance,
          snapshot: await readSnapshotForExport(context.storage, viewpoint),
        })),
      ),
    })),
  );

  return {
    bytes: await context.archives.encode({
      projectId,
      projectName: project.title,
      topics: exportTopics,
    }),
    fileName: `${safeFileName(project.title)}.bcf`,
  };
}
export async function importBcfArchive(
  context: BcfArchiveContext,
  actorId: string,
  projectId: string,
  bytes: Uint8Array,
) {
  if (bytes.byteLength > maxBcfArchiveBytes) {
    throw new BcfArchiveTooLargeError(
      "L’archive BCF dépasse la limite de 50 Mio.",
    );
  }

  let archive: Awaited<ReturnType<BcfArchiveCodec["decode"]>>;
  try {
    archive = await context.archives.decode(bytes);
  } catch (error) {
    if (error instanceof BcfArchiveTooLargeError) throw error;
    throw new BcfArchiveInvalidError(
      error instanceof Error
        ? error.message
        : "L’archive BCF n’a pas pu être lue.",
    );
  }

  const importedAt = context.now();
  const writtenSnapshotKeys: string[] = [];
  const records = archive.topics.map((topic) => {
    const topicId = context.createId();
    const createdAt = safeDate(topic.createdAt, importedAt);
    const updatedAt = safeDate(topic.updatedAt, createdAt);

    return {
      id: topicId,
      exchangeMetadata: topic.metadata,
      bcfGuid: topic.guid,
      projectId,
      title: topic.title.slice(0, 255),
      description: topic.description?.slice(0, 10_000) ?? null,
      type: topic.type,
      status: topic.status,
      priority: topic.priority,
      assignedTo: topic.assignedTo,
      dueDate: topic.dueDate,
      labels: topic.labels,
      modifiedAuthor: topic.modifiedAuthor,
      createdBy: actorId,
      externalAuthor: topic.authorName.slice(0, 320),
      createdAt,
      updatedAt,
      components: topic.componentGlobalIds.map((globalId) => ({
        id: context.createId(),
        globalId: globalId.slice(0, 64),
      })),
      comments: topic.comments.map((comment) => ({
        id: context.createId(),
        bcfGuid: comment.guid,
        externalAuthor: comment.authorName.slice(0, 320),
        comment: comment.comment.slice(0, 10_000),
        viewpointBcfGuid: comment.viewpointGuid,
        createdAt: safeDate(comment.createdAt, createdAt),
      })),
      viewpoints: topic.viewpoints.map((viewpoint) => {
        const viewpointId = context.createId();
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
        if (!viewpoint.snapshotObjectKey || !viewpoint.snapshotBytes) continue;
        await context.storage.writeObject({
          objectKey: viewpoint.snapshotObjectKey,
          contentType: viewpoint.snapshotMediaType ?? "image/png",
          body: viewpoint.snapshotBytes,
        });
        writtenSnapshotKeys.push(viewpoint.snapshotObjectKey);
      }
    }

    const imported = await context.topics.importTopics(
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
    await deleteSnapshotsBestEffort(context.storage, skippedSnapshotKeys);

    const insertedRecords = records.filter((topic) =>
      insertedTopicIds.has(topic.id),
    );

    return {
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
    await deleteSnapshotsBestEffort(context.storage, writtenSnapshotKeys);
    throw error;
  }
}
function safeDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
function safeFileName(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "projet-mnemo";
}
