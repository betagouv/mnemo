import {
  bcfViewpointPayloadSchema,
  type BcfComment,
  type BcfComponent,
  type BcfTopic,
} from "@mnemo/contracts/bcf";
import {
  assets,
  bcfComments,
  bcfTopicComponents,
  bcfTopics,
  bcfViewpoints,
  users,
  type MnemoDatabase,
} from "@mnemo/database";
import { and, asc, desc, eq } from "drizzle-orm";

import { BcfComponentNotFoundError } from "../application/bcf-topic-errors";
import type {
  BcfTopicRepository,
  CreateBcfTopicRecord,
  StoredBcfTopic,
  StoredBcfViewpoint,
} from "../application/bcf-topic-repository";

type TopicRow = {
  topic: typeof bcfTopics.$inferSelect;
  authorName: string;
};

function toTopic(
  row: TopicRow,
  components: BcfComponent[],
  comments: BcfComment[],
  viewpoints: StoredBcfViewpoint[],
): StoredBcfTopic {
  return {
    id: row.topic.id,
    projectId: row.topic.projectId,
    title: row.topic.title,
    description: row.topic.description,
    type: row.topic.type,
    status: row.topic.status,
    priority: row.topic.priority,
    authorName: row.authorName,
    components,
    comments,
    viewpoints,
    createdAt: row.topic.createdAt.toISOString(),
    updatedAt: row.topic.updatedAt.toISOString(),
  };
}

export class DrizzleBcfTopicRepository implements BcfTopicRepository {
  constructor(private readonly database: MnemoDatabase) {}

  async list(projectId: string): Promise<StoredBcfTopic[]> {
    const topicRows = await this.database
      .select({ topic: bcfTopics, authorName: users.displayName })
      .from(bcfTopics)
      .innerJoin(users, eq(users.id, bcfTopics.createdBy))
      .where(eq(bcfTopics.projectId, projectId))
      .orderBy(desc(bcfTopics.updatedAt));

    if (!topicRows.length) return [];

    const componentRows = await this.database
      .select({ component: bcfTopicComponents })
      .from(bcfTopicComponents)
      .innerJoin(bcfTopics, eq(bcfTopics.id, bcfTopicComponents.topicId))
      .where(eq(bcfTopics.projectId, projectId))
      .orderBy(asc(bcfTopicComponents.createdAt));
    const commentRows = await this.database
      .select({ comment: bcfComments, authorName: users.displayName })
      .from(bcfComments)
      .innerJoin(bcfTopics, eq(bcfTopics.id, bcfComments.topicId))
      .innerJoin(users, eq(users.id, bcfComments.authorId))
      .where(eq(bcfTopics.projectId, projectId))
      .orderBy(asc(bcfComments.createdAt));
    const viewpointRows = await this.database
      .select({ viewpoint: bcfViewpoints, authorName: users.displayName })
      .from(bcfViewpoints)
      .innerJoin(bcfTopics, eq(bcfTopics.id, bcfViewpoints.topicId))
      .innerJoin(users, eq(users.id, bcfViewpoints.createdBy))
      .where(eq(bcfTopics.projectId, projectId))
      .orderBy(asc(bcfViewpoints.createdAt));

    const componentsByTopic = new Map<string, BcfComponent[]>();
    for (const { component } of componentRows) {
      const components = componentsByTopic.get(component.topicId) ?? [];
      components.push({
        id: component.id,
        assetId: component.assetId,
        globalId: component.globalId,
        expressId: component.expressId,
      });
      componentsByTopic.set(component.topicId, components);
    }

    const commentsByTopic = new Map<string, BcfComment[]>();
    for (const { comment, authorName } of commentRows) {
      const comments = commentsByTopic.get(comment.topicId) ?? [];
      comments.push({
        id: comment.id,
        authorName,
        comment: comment.comment,
        createdAt: comment.createdAt.toISOString(),
      });
      commentsByTopic.set(comment.topicId, comments);
    }

    const viewpointsByTopic = new Map<string, StoredBcfViewpoint[]>();
    for (const { viewpoint, authorName } of viewpointRows) {
      const viewpoints = viewpointsByTopic.get(viewpoint.topicId) ?? [];
      viewpoints.push({
        id: viewpoint.id,
        topicId: viewpoint.topicId,
        data: bcfViewpointPayloadSchema.parse(viewpoint.data),
        targetDistance: viewpoint.targetDistance,
        snapshotObjectKey: viewpoint.snapshotObjectKey,
        snapshotMediaType: viewpoint.snapshotMediaType,
        snapshotExpectedSize: viewpoint.snapshotExpectedSize,
        snapshotUploadedAt: viewpoint.snapshotUploadedAt?.toISOString() ?? null,
        authorName,
        createdAt: viewpoint.createdAt.toISOString(),
      });
      viewpointsByTopic.set(viewpoint.topicId, viewpoints);
    }

    return topicRows.map((row) =>
      toTopic(
        row,
        componentsByTopic.get(row.topic.id) ?? [],
        commentsByTopic.get(row.topic.id) ?? [],
        viewpointsByTopic.get(row.topic.id) ?? [],
      ),
    );
  }

  async create(input: CreateBcfTopicRecord) {
    await this.database.transaction(async (transaction) => {
      if (input.component) {
        const [componentAsset] = await transaction
          .select({ id: assets.id })
          .from(assets)
          .where(
            and(
              eq(assets.id, input.component.assetId),
              eq(assets.projectId, input.projectId),
            ),
          )
          .limit(1);
        if (!componentAsset) {
          throw new BcfComponentNotFoundError(
            "The referenced IFC asset is not in this project",
          );
        }
      }

      await transaction.insert(bcfTopics).values({
        id: input.id,
        projectId: input.projectId,
        title: input.title,
        description: input.description || null,
        type: input.type,
        priority: input.priority,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });

      if (input.component) {
        await transaction.insert(bcfTopicComponents).values({
          topicId: input.id,
          assetId: input.component.assetId,
          globalId: input.component.globalId,
          expressId: input.component.expressId,
          createdAt: input.createdAt,
        });
      }
    });

    return this.requireTopic(input.projectId, input.id);
  }

  async addComment(input: {
    id: string;
    projectId: string;
    topicId: string;
    authorId: string;
    comment: string;
    createdAt: Date;
  }) {
    const [topic] = await this.database
      .select({ id: bcfTopics.id })
      .from(bcfTopics)
      .where(
        and(
          eq(bcfTopics.id, input.topicId),
          eq(bcfTopics.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (!topic) return null;

    await this.database.transaction(async (transaction) => {
      await transaction.insert(bcfComments).values({
        id: input.id,
        topicId: input.topicId,
        authorId: input.authorId,
        comment: input.comment,
        createdAt: input.createdAt,
      });
      await transaction
        .update(bcfTopics)
        .set({ updatedAt: input.createdAt })
        .where(eq(bcfTopics.id, input.topicId));
    });
    return this.requireTopic(input.projectId, input.topicId);
  }

  async updateStatus(input: {
    projectId: string;
    topicId: string;
    status: BcfTopic["status"];
    updatedAt: Date;
  }) {
    const [updated] = await this.database
      .update(bcfTopics)
      .set({ status: input.status, updatedAt: input.updatedAt })
      .where(
        and(
          eq(bcfTopics.id, input.topicId),
          eq(bcfTopics.projectId, input.projectId),
        ),
      )
      .returning({ id: bcfTopics.id });
    return updated ? this.requireTopic(input.projectId, input.topicId) : null;
  }

  async createViewpoint(input: {
    id: string;
    projectId: string;
    topicId: string;
    data: Parameters<BcfTopicRepository["createViewpoint"]>[0]["data"];
    targetDistance: number;
    snapshotObjectKey: string | null;
    snapshotMediaType: string | null;
    snapshotExpectedSize: number | null;
    createdBy: string;
    createdAt: Date;
  }) {
    const created = await this.database.transaction(async (transaction) => {
      const [topic] = await transaction
        .select({ id: bcfTopics.id })
        .from(bcfTopics)
        .where(
          and(
            eq(bcfTopics.id, input.topicId),
            eq(bcfTopics.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!topic) return false;

      await transaction.insert(bcfViewpoints).values({
        id: input.id,
        topicId: input.topicId,
        data: input.data,
        targetDistance: input.targetDistance,
        snapshotObjectKey: input.snapshotObjectKey,
        snapshotMediaType: input.snapshotMediaType,
        snapshotExpectedSize: input.snapshotExpectedSize,
        snapshotUploadedAt: input.snapshotObjectKey ? null : input.createdAt,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
      });
      await transaction
        .update(bcfTopics)
        .set({ updatedAt: input.createdAt })
        .where(eq(bcfTopics.id, input.topicId));
      return true;
    });

    return created ? this.requireTopic(input.projectId, input.topicId) : null;
  }

  async findViewpoint(projectId: string, topicId: string, viewpointId: string) {
    const [row] = await this.database
      .select({ viewpoint: bcfViewpoints, authorName: users.displayName })
      .from(bcfViewpoints)
      .innerJoin(bcfTopics, eq(bcfTopics.id, bcfViewpoints.topicId))
      .innerJoin(users, eq(users.id, bcfViewpoints.createdBy))
      .where(
        and(
          eq(bcfViewpoints.id, viewpointId),
          eq(bcfViewpoints.topicId, topicId),
          eq(bcfTopics.projectId, projectId),
        ),
      )
      .limit(1);
    if (!row) return null;

    return {
      id: row.viewpoint.id,
      topicId: row.viewpoint.topicId,
      data: bcfViewpointPayloadSchema.parse(row.viewpoint.data),
      targetDistance: row.viewpoint.targetDistance,
      snapshotObjectKey: row.viewpoint.snapshotObjectKey,
      snapshotMediaType: row.viewpoint.snapshotMediaType,
      snapshotExpectedSize: row.viewpoint.snapshotExpectedSize,
      snapshotUploadedAt:
        row.viewpoint.snapshotUploadedAt?.toISOString() ?? null,
      authorName: row.authorName,
      createdAt: row.viewpoint.createdAt.toISOString(),
    } satisfies StoredBcfViewpoint;
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

    await this.database
      .update(bcfViewpoints)
      .set({ snapshotUploadedAt: input.uploadedAt })
      .where(
        and(
          eq(bcfViewpoints.id, input.viewpointId),
          eq(bcfViewpoints.topicId, input.topicId),
        ),
      );
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
