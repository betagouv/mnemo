import { bcfViewpointPayloadSchema, type BcfTopic } from "@mnemo/contracts/bcf";
import { Prisma, type MnemoPrismaDatabase } from "@mnemo/database";

import { BcfComponentNotFoundError } from "../application/bcf-topic-errors";
import type {
  BcfTopicRepository,
  CreateBcfTopicRecord,
  ImportBcfTopicRecord,
  StoredBcfTopic,
  StoredBcfViewpoint,
} from "../application/bcf-topic-repository";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class PrismaBcfTopicRepository implements BcfTopicRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async list(projectId: string): Promise<StoredBcfTopic[]> {
    const rows = await this.database.bcf_topics.findMany({
      where: { project_id: projectId },
      include: {
        users: true,
        bcf_topic_components: { orderBy: { created_at: "asc" } },
        bcf_comments: {
          include: { users: true },
          orderBy: { created_at: "asc" },
        },
        bcf_viewpoints: {
          include: { users: true },
          orderBy: { created_at: "asc" },
        },
      },
      orderBy: { updated_at: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      bcfGuid: row.bcf_guid,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      priority: row.priority,
      authorName: row.external_author ?? row.users.display_name,
      components: row.bcf_topic_components.map((component) => ({
        id: component.id,
        assetId: component.asset_id,
        globalId: component.global_id,
        expressId: component.express_id,
      })),
      comments: row.bcf_comments.map((comment) => ({
        id: comment.id,
        bcfGuid: comment.bcf_guid,
        authorName: comment.external_author ?? comment.users.display_name,
        comment: comment.comment,
        createdAt: comment.created_at.toISOString(),
        viewpointBcfGuid: comment.viewpoint_bcf_guid,
      })),
      viewpoints: row.bcf_viewpoints.map((viewpoint) => ({
        id: viewpoint.id,
        bcfGuid: viewpoint.bcf_guid,
        topicId: viewpoint.topic_id,
        data: bcfViewpointPayloadSchema.parse(viewpoint.data),
        targetDistance: viewpoint.target_distance,
        snapshotObjectKey: viewpoint.snapshot_object_key,
        snapshotMediaType: viewpoint.snapshot_media_type,
        snapshotExpectedSize:
          viewpoint.snapshot_expected_size === null
            ? null
            : Number(viewpoint.snapshot_expected_size),
        snapshotUploadedAt:
          viewpoint.snapshot_uploaded_at?.toISOString() ?? null,
        authorName: viewpoint.external_author ?? viewpoint.users.display_name,
        createdAt: viewpoint.created_at.toISOString(),
      })),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async create(input: CreateBcfTopicRecord) {
    await this.database.$transaction(async (transaction) => {
      if (input.component) {
        const asset = await transaction.assets.findFirst({
          where: { id: input.component.assetId, project_id: input.projectId },
          select: { id: true },
        });
        if (!asset) {
          throw new BcfComponentNotFoundError(
            "The referenced IFC asset is not in this project",
          );
        }
      }

      await transaction.bcf_topics.create({
        data: {
          id: input.id,
          bcf_guid: input.id,
          project_id: input.projectId,
          title: input.title,
          description: input.description || null,
          type: input.type,
          priority: input.priority,
          created_by: input.createdBy,
          created_at: input.createdAt,
          updated_at: input.createdAt,
        },
      });
      if (input.component) {
        await transaction.bcf_topic_components.create({
          data: {
            topic_id: input.id,
            asset_id: input.component.assetId,
            global_id: input.component.globalId,
            express_id: input.component.expressId,
            created_at: input.createdAt,
          },
        });
      }
    });
    return this.requireTopic(input.projectId, input.id);
  }

  async importTopics(input: ImportBcfTopicRecord[]) {
    if (!input.length) return { insertedTopicIds: [], skippedBcfGuids: [] };
    return this.database.$transaction(async (transaction) => {
      const projectId = input[0]?.projectId;
      if (!projectId || input.some((topic) => topic.projectId !== projectId)) {
        throw new Error("A BCF import transaction must target one project");
      }

      const existing = await transaction.bcf_topics.findMany({
        where: {
          project_id: projectId,
          bcf_guid: { in: input.map((topic) => topic.bcfGuid) },
        },
        select: { bcf_guid: true },
      });
      const skipped = new Set(existing.map((row) => row.bcf_guid));
      const insertedTopicIds: string[] = [];

      for (const topic of input) {
        if (skipped.has(topic.bcfGuid)) continue;
        const inserted = await transaction.bcf_topics.createMany({
          data: [
            {
              id: topic.id,
              bcf_guid: topic.bcfGuid,
              project_id: topic.projectId,
              title: topic.title,
              description: topic.description,
              type: topic.type,
              status: topic.status,
              priority: topic.priority,
              created_by: topic.createdBy,
              external_author: topic.externalAuthor,
              created_at: topic.createdAt,
              updated_at: topic.updatedAt,
            },
          ],
          skipDuplicates: true,
        });
        if (!inserted.count) {
          skipped.add(topic.bcfGuid);
          continue;
        }
        insertedTopicIds.push(topic.id);

        if (topic.components.length) {
          await transaction.bcf_topic_components.createMany({
            data: topic.components.map((component) => ({
              id: component.id,
              topic_id: topic.id,
              asset_id: null,
              global_id: component.globalId,
              express_id: null,
              created_at: topic.createdAt,
            })),
          });
        }
        if (topic.viewpoints.length) {
          await transaction.bcf_viewpoints.createMany({
            data: topic.viewpoints.map((viewpoint) => ({
              id: viewpoint.id,
              bcf_guid: viewpoint.bcfGuid,
              topic_id: topic.id,
              data: json(viewpoint.data),
              target_distance: viewpoint.targetDistance,
              snapshot_object_key: viewpoint.snapshotObjectKey,
              snapshot_media_type: viewpoint.snapshotMediaType,
              snapshot_expected_size:
                viewpoint.snapshotExpectedSize === null
                  ? null
                  : BigInt(viewpoint.snapshotExpectedSize),
              snapshot_uploaded_at: viewpoint.snapshotUploadedAt,
              created_by: topic.createdBy,
              external_author: viewpoint.externalAuthor,
              created_at: viewpoint.createdAt,
            })),
          });
        }
        if (topic.comments.length) {
          await transaction.bcf_comments.createMany({
            data: topic.comments.map((comment) => ({
              id: comment.id,
              bcf_guid: comment.bcfGuid,
              topic_id: topic.id,
              author_id: topic.createdBy,
              external_author: comment.externalAuthor,
              viewpoint_bcf_guid: comment.viewpointBcfGuid,
              comment: comment.comment,
              created_at: comment.createdAt,
            })),
          });
        }
      }
      return { insertedTopicIds, skippedBcfGuids: [...skipped] };
    });
  }

  async addComment(input: {
    id: string;
    projectId: string;
    topicId: string;
    authorId: string;
    comment: string;
    createdAt: Date;
  }) {
    const topic = await this.database.bcf_topics.findFirst({
      where: { id: input.topicId, project_id: input.projectId },
      select: { id: true },
    });
    if (!topic) return null;
    await this.database.$transaction([
      this.database.bcf_comments.create({
        data: {
          id: input.id,
          bcf_guid: input.id,
          topic_id: input.topicId,
          author_id: input.authorId,
          comment: input.comment,
          created_at: input.createdAt,
        },
      }),
      this.database.bcf_topics.update({
        where: { id: input.topicId },
        data: { updated_at: input.createdAt },
      }),
    ]);
    return this.requireTopic(input.projectId, input.topicId);
  }

  async updateStatus(input: {
    projectId: string;
    topicId: string;
    status: BcfTopic["status"];
    updatedAt: Date;
  }) {
    const updated = await this.database.bcf_topics.updateMany({
      where: { id: input.topicId, project_id: input.projectId },
      data: { status: input.status, updated_at: input.updatedAt },
    });
    return updated.count
      ? this.requireTopic(input.projectId, input.topicId)
      : null;
  }

  async createViewpoint(
    input: Parameters<BcfTopicRepository["createViewpoint"]>[0],
  ) {
    const created = await this.database.$transaction(async (transaction) => {
      const topic = await transaction.bcf_topics.findFirst({
        where: { id: input.topicId, project_id: input.projectId },
        select: { id: true },
      });
      if (!topic) return false;
      await transaction.bcf_viewpoints.create({
        data: {
          id: input.id,
          bcf_guid: input.id,
          topic_id: input.topicId,
          data: json(input.data),
          target_distance: input.targetDistance,
          snapshot_object_key: input.snapshotObjectKey,
          snapshot_media_type: input.snapshotMediaType,
          snapshot_expected_size:
            input.snapshotExpectedSize === null
              ? null
              : BigInt(input.snapshotExpectedSize),
          snapshot_uploaded_at: input.snapshotObjectKey
            ? null
            : input.createdAt,
          created_by: input.createdBy,
          created_at: input.createdAt,
        },
      });
      await transaction.bcf_topics.update({
        where: { id: input.topicId },
        data: { updated_at: input.createdAt },
      });
      return true;
    });
    return created ? this.requireTopic(input.projectId, input.topicId) : null;
  }

  async findViewpoint(
    projectId: string,
    topicId: string,
    viewpointId: string,
  ): Promise<StoredBcfViewpoint | null> {
    const row = await this.database.bcf_viewpoints.findFirst({
      where: {
        id: viewpointId,
        topic_id: topicId,
        bcf_topics: { project_id: projectId },
      },
      include: { users: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      bcfGuid: row.bcf_guid,
      topicId: row.topic_id,
      data: bcfViewpointPayloadSchema.parse(row.data),
      targetDistance: row.target_distance,
      snapshotObjectKey: row.snapshot_object_key,
      snapshotMediaType: row.snapshot_media_type,
      snapshotExpectedSize:
        row.snapshot_expected_size === null
          ? null
          : Number(row.snapshot_expected_size),
      snapshotUploadedAt: row.snapshot_uploaded_at?.toISOString() ?? null,
      authorName: row.external_author ?? row.users.display_name,
      createdAt: row.created_at.toISOString(),
    };
  }

  async markViewpointSnapshotUploaded(input: {
    projectId: string;
    topicId: string;
    viewpointId: string;
    uploadedAt: Date;
  }) {
    const viewpoint = await this.findViewpoint(
      input.projectId,
      input.topicId,
      input.viewpointId,
    );
    if (!viewpoint) return null;
    await this.database.bcf_viewpoints.update({
      where: { id: input.viewpointId },
      data: { snapshot_uploaded_at: input.uploadedAt },
    });
    return this.requireTopic(input.projectId, input.topicId);
  }

  private async requireTopic(projectId: string, topicId: string) {
    const topic = (await this.list(projectId)).find(
      (item) => item.id === topicId,
    );
    if (!topic) throw new Error("BCF topic write returned no row");
    return topic;
  }
}
