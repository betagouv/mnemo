import {
  bcfDefaults,
  bcfExchangeMetadataSchema,
  bcfProjectOptionsSchema,
  bcfViewpointPayloadSchema,
  type BcfTopic,
  type UpdateBcfTopicInput,
} from "@mnemo/contracts/bcf";
import { Prisma, type MnemoPrismaDatabase } from "@mnemo/database";

import { BcfComponentNotFoundError } from "../application/bcf-topic-errors";
import type {
  BcfTopicRepository,
  CreateBcfTopicRecord,
  ImportBcfTopicRecord,
  StoredBcfTopic,
  BcfSnapshotUpload,
  PreparedBcfViewpoint,
} from "../application/bcf-topic-repository";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class PrismaBcfTopicRepository implements BcfTopicRepository {
  constructor(private readonly database: MnemoPrismaDatabase) {}

  async list(projectId: string): Promise<StoredBcfTopic[]> {
    return this.read({ project_id: projectId });
  }
  async find(projectId: string, topicId: string) {
    return (await this.read({ project_id: projectId, id: topicId }))[0] ?? null;
  }
  private async read(
    where: Prisma.bcf_topicsWhereInput,
  ): Promise<StoredBcfTopic[]> {
    const rows = await this.database.bcf_topics.findMany({
      where,
      include: {
        users: true,
        bcf_topic_components: {
          include: { assets: { select: { original_file_name: true } } },
          orderBy: { created_at: "asc" },
        },
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
      exchangeMetadata: {
        ...(row.exchange_metadata
          ? bcfExchangeMetadataSchema.parse(row.exchange_metadata)
          : {}),
        header: [
          ...new Map(
            [
              ...(row.exchange_metadata
                ? (bcfExchangeMetadataSchema.parse(row.exchange_metadata)
                    .header ?? [])
                : []),
              ...row.bcf_topic_components.flatMap((component) =>
                component.assets
                  ? [
                      {
                        filename: component.assets.original_file_name,
                        reference: undefined,
                      },
                    ]
                  : [],
              ),
            ].map((file) => [
              file.reference ?? file.filename ?? JSON.stringify(file),
              file,
            ]),
          ).values(),
        ],
      },
      bcfGuid: row.bcf_guid,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      priority: row.priority,
      authorName: row.external_author ?? row.users.display_name,
      authorEmail: row.external_author ?? row.users.email,
      modifiedAuthor: row.modified_author,
      number: row.number,
      assignedTo: row.assigned_to,
      dueDate: row.due_date?.toISOString().slice(0, 10) ?? null,
      labels: row.labels,
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
        authorEmail: comment.external_author ?? comment.users.email,
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
      await this.validateReferences(
        transaction,
        input.projectId,
        input.components,
        input.assignedTo,
      );
      await transaction.bcf_topics.create({
        data: {
          id: input.id,
          bcf_guid: input.id,
          project_id: input.projectId,
          title: input.title,
          description: input.description || null,
          type: input.type,
          priority: input.priority,
          assigned_to: input.assignedTo,
          due_date: input.dueDate ? new Date(input.dueDate) : null,
          labels: input.labels,
          created_by: input.createdBy,
          created_at: input.createdAt,
          updated_at: input.createdAt,
        },
      });
      if (input.components.length)
        await transaction.bcf_topic_components.createMany({
          data: input.components.map((component) => ({
            topic_id: input.id,
            asset_id: component.assetId,
            global_id: component.globalId,
            express_id: component.expressId,
            created_at: input.createdAt,
          })),
        });
      if (input.preparedViewpoint)
        await this.insertViewpoint(
          transaction,
          input.id,
          input.projectId,
          input.preparedViewpoint,
        );
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
              exchange_metadata: topic.exchangeMetadata
                ? json(topic.exchangeMetadata)
                : undefined,
              bcf_guid: topic.bcfGuid,
              project_id: topic.projectId,
              title: topic.title,
              description: topic.description,
              type: topic.type,
              status: topic.status,
              priority: topic.priority,
              assigned_to: topic.assignedTo,
              due_date: topic.dueDate ? new Date(topic.dueDate) : null,
              labels: topic.labels ?? [],
              modified_author: topic.modifiedAuthor,
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
    preparedViewpoint?: PreparedBcfViewpoint;
  }) {
    const topic = await this.database.bcf_topics.findFirst({
      where: { id: input.topicId, project_id: input.projectId },
      select: { id: true },
    });
    if (!topic) return null;
    await this.database.$transaction(async (transaction) => {
      if (input.preparedViewpoint)
        await this.insertViewpoint(
          transaction,
          input.topicId,
          input.projectId,
          input.preparedViewpoint,
        );
      await transaction.bcf_comments.create({
        data: {
          id: input.id,
          bcf_guid: input.id,
          topic_id: input.topicId,
          author_id: input.authorId,
          comment: input.comment,
          viewpoint_bcf_guid: input.preparedViewpoint?.id,
          created_at: input.createdAt,
        },
      });
      await transaction.bcf_topics.update({
        where: { id: input.topicId },
        data: { updated_at: input.createdAt },
      });
    });
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
          snapshot_uploaded_at: input.createdAt,
          created_by: input.createdBy,
          created_at: input.createdAt,
        },
      });
      if (input.uploadId)
        await this.consumeUpload(
          transaction,
          input.projectId,
          input.createdBy,
          input.uploadId,
          input.createdAt,
        );
      await this.keepSnapshot(transaction, input);
      await transaction.bcf_topics.update({
        where: { id: input.topicId },
        data: { updated_at: input.createdAt },
      });
      return true;
    });
    return created ? this.requireTopic(input.projectId, input.topicId) : null;
  }

  async markers(projectId: string) {
    const rows = await this.database.bcf_topics.findMany({
      where: { project_id: projectId },
      select: {
        id: true,
        title: true,
        number: true,
        type: true,
        status: true,
        priority: true,
        bcf_viewpoints: {
          take: 1,
          orderBy: { created_at: "asc" },
          select: { data: true, target_distance: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      number: row.number,
      type: row.type,
      status: row.status,
      priority: row.priority,
      viewpoint: row.bcf_viewpoints[0]
        ? bcfViewpointPayloadSchema.parse(row.bcf_viewpoints[0].data)
        : null,
      targetDistance: row.bcf_viewpoints[0]?.target_distance ?? 10,
    }));
  }
  async summaries(projectId: string) {
    const rows = await this.database.bcf_topics.findMany({
      where: { project_id: projectId },
      include: {
        users: true,
        _count: { select: { bcf_comments: true, bcf_viewpoints: true } },
      },
      orderBy: { updated_at: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      number: row.number,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      priority: row.priority,
      authorName: row.external_author ?? row.users.display_name,
      authorEmail: row.external_author ?? row.users.email,
      modifiedAuthor: row.modified_author,
      assignedTo: row.assigned_to,
      dueDate: row.due_date?.toISOString().slice(0, 10) ?? null,
      labels: row.labels,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      commentCount: row._count.bcf_comments,
      viewpointCount: row._count.bcf_viewpoints,
    }));
  }
  async members(projectId: string) {
    return (
      await this.database.project_members.findMany({
        where: { project_id: projectId },
        include: { users: true },
      })
    ).map((row) => ({
      id: row.users.id,
      name: row.users.display_name,
      email: row.users.email,
    }));
  }
  async options(projectId: string) {
    const row = await this.database.projects.findUnique({
      where: { id: projectId },
      select: { bcf_options: true },
    });
    return bcfProjectOptionsSchema.parse(row?.bcf_options ?? bcfDefaults);
  }
  async findSnapshot(projectId: string, topicId: string, viewpointId: string) {
    const row = await this.database.bcf_viewpoints.findFirst({
      where: {
        id: viewpointId,
        topic_id: topicId,
        bcf_topics: { project_id: projectId },
        snapshot_uploaded_at: { not: null },
      },
      select: { snapshot_object_key: true },
    });
    return row?.snapshot_object_key
      ? { objectKey: row.snapshot_object_key }
      : null;
  }
  async update(
    input: UpdateBcfTopicInput & { modifiedAuthor: string; updatedAt: Date },
  ) {
    const updated = await this.database.$transaction(async (transaction) => {
      const current = await transaction.bcf_topics.findFirst({
        where: { id: input.topicId, project_id: input.projectId },
        select: { assigned_to: true },
      });
      if (!current) return false;
      await this.validateReferences(
        transaction,
        input.projectId,
        input.components,
        input.assignedTo === current.assigned_to ? null : input.assignedTo,
      );
      await transaction.bcf_topics.update({
        where: { id: input.topicId },
        data: {
          title: input.title,
          description: input.description || null,
          type: input.type,
          status: input.status,
          priority: input.priority,
          assigned_to: input.assignedTo,
          due_date: input.dueDate ? new Date(input.dueDate) : null,
          labels: input.labels,
          modified_author: input.modifiedAuthor,
          updated_at: input.updatedAt,
        },
      });
      await transaction.bcf_topic_components.deleteMany({
        where: { topic_id: input.topicId },
      });
      if (input.components.length)
        await transaction.bcf_topic_components.createMany({
          data: input.components.map((component) => ({
            topic_id: input.topicId,
            asset_id: component.assetId,
            global_id: component.globalId,
            express_id: component.expressId,
          })),
        });
      return true;
    });
    return updated ? this.find(input.projectId, input.topicId) : null;
  }
  private async validateReferences(
    transaction: Prisma.TransactionClient,
    projectId: string,
    components: Array<{ assetId: string | null }>,
    assignedTo: string | null,
  ) {
    const assetIds = [
      ...new Set(
        components.flatMap((component) =>
          component.assetId ? [component.assetId] : [],
        ),
      ),
    ];
    const count = await transaction.assets.count({
      where: { id: { in: assetIds }, project_id: projectId, kind: "ifc" },
    });
    if (count !== assetIds.length)
      throw new BcfComponentNotFoundError(
        "Un objet référence une maquette absente de ce dossier.",
      );
    if (
      assignedTo &&
      !(await transaction.project_members.findFirst({
        where: { project_id: projectId, users: { email: assignedTo } },
      }))
    )
      throw new BcfComponentNotFoundError(
        "Le responsable doit être membre du dossier.",
      );
  }
  async protectSnapshot(id: string, objectKey: string, expiresAt: Date) {
    await this.database.deletion_jobs.create({
      data: {
        id,
        type: "delete_bcf_upload",
        resource_id: id,
        object_keys: [objectKey],
        available_at: expiresAt,
      },
    });
  }
  async prepareUpload(input: BcfSnapshotUpload) {
    await this.database.$transaction(async (transaction) => {
      await transaction.bcf_snapshot_uploads.create({
        data: {
          id: input.id,
          project_id: input.projectId,
          actor_id: input.actorId,
          object_key: input.objectKey,
          media_type: input.mediaType,
          size_bytes: input.sizeBytes,
          expires_at: input.expiresAt,
        },
      });
      await transaction.deletion_jobs.create({
        data: {
          type: "delete_bcf_upload",
          resource_id: input.id,
          object_keys: [input.objectKey],
          available_at: input.expiresAt,
        },
      });
    });
  }
  async findUpload(projectId: string, actorId: string, uploadId: string) {
    const row = await this.database.bcf_snapshot_uploads.findFirst({
      where: { id: uploadId, project_id: projectId, actor_id: actorId },
    });
    return row
      ? {
          id: row.id,
          projectId: row.project_id,
          actorId: row.actor_id,
          objectKey: row.object_key,
          mediaType: row.media_type,
          sizeBytes: row.size_bytes,
          expiresAt: row.expires_at,
        }
      : null;
  }
  private async consumeUpload(
    transaction: Prisma.TransactionClient,
    projectId: string,
    actorId: string,
    uploadId: string,
    now: Date,
  ) {
    const result = await transaction.bcf_snapshot_uploads.deleteMany({
      where: {
        id: uploadId,
        project_id: projectId,
        actor_id: actorId,
        expires_at: { gt: now },
      },
    });
    if (result.count !== 1)
      throw new Error(
        "La capture a expiré ou a déjà été utilisée. Reprenez la capture.",
      );
  }
  private async keepSnapshot(
    transaction: Prisma.TransactionClient,
    input: PreparedBcfViewpoint,
  ) {
    if (!input.uploadId || !input.snapshotObjectKey) return;
    const result = await transaction.deletion_jobs.deleteMany({
      where: { id: input.id, status: "queued" },
    });
    if (result.count !== 1)
      throw new Error("La capture a expiré. Reprenez l’enregistrement.");
  }
  private async insertViewpoint(
    transaction: Prisma.TransactionClient,
    topicId: string,
    projectId: string,
    input: PreparedBcfViewpoint,
  ) {
    if (input.uploadId)
      await this.consumeUpload(
        transaction,
        projectId,
        input.createdBy,
        input.uploadId,
        input.createdAt,
      );
    await this.keepSnapshot(transaction, input);
    await transaction.bcf_viewpoints.create({
      data: {
        id: input.id,
        bcf_guid: input.id,
        topic_id: topicId,
        data: json(input.data),
        target_distance: input.targetDistance,
        snapshot_object_key: input.snapshotObjectKey,
        snapshot_media_type: input.snapshotMediaType,
        snapshot_expected_size: input.snapshotExpectedSize,
        snapshot_uploaded_at: input.createdAt,
        created_by: input.createdBy,
        created_at: input.createdAt,
      },
    });
  }

  private async requireTopic(projectId: string, topicId: string) {
    const topic = await this.find(projectId, topicId);
    if (!topic) throw new Error("BCF topic write returned no row");
    return topic;
  }
}
