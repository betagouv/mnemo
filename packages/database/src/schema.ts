import { assetKinds, assetStatuses } from "@mnemo/domain/asset";
import {
  bcfPriorities,
  bcfTopicStatuses,
  bcfTopicTypes,
} from "@mnemo/domain/bcf";
import {
  processingJobStatuses,
  processingJobTypes,
} from "@mnemo/domain/processing-job";
import { projectRoles } from "@mnemo/domain/project";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const projectRoleEnum = pgEnum("project_role", projectRoles);
export const assetKindEnum = pgEnum("asset_kind", assetKinds);
export const assetStatusEnum = pgEnum("asset_status", assetStatuses);
export const processingJobTypeEnum = pgEnum(
  "processing_job_type",
  processingJobTypes,
);
export const processingJobStatusEnum = pgEnum(
  "processing_job_status",
  processingJobStatuses,
);
export const deletionJobTypeEnum = pgEnum("deletion_job_type", [
  "delete_asset",
  "delete_project",
]);
export const bcfTopicStatusEnum = pgEnum("bcf_topic_status", bcfTopicStatuses);
export const bcfTopicTypeEnum = pgEnum("bcf_topic_type", bcfTopicTypes);
export const bcfPriorityEnum = pgEnum("bcf_priority", bcfPriorities);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("projects_created_by_idx").on(table.createdBy)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRoleEnum("role").default("viewer").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index("project_members_project_id_idx").on(table.projectId),
    index("project_members_user_id_idx").on(table.userId),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: assetKindEnum("kind").notNull(),
    originalFileName: varchar("original_file_name", { length: 512 }).notNull(),
    mediaType: varchar("media_type", { length: 255 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    originalObjectKey: text("original_object_key").notNull(),
    status: assetStatusEnum("status").default("upload_pending").notNull(),
    errorMessage: text("error_message"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    uploadExpiresAt: timestamp("upload_expires_at", {
      withTimezone: true,
    }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("assets_project_id_idx").on(table.projectId),
    index("assets_status_idx").on(table.status),
    uniqueIndex("assets_original_object_key_unique").on(
      table.originalObjectKey,
    ),
  ],
);

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    type: processingJobTypeEnum("type").notNull(),
    status: processingJobStatusEnum("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 160 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("processing_jobs_asset_type_unique").on(
      table.assetId,
      table.type,
    ),
    index("processing_jobs_poll_idx").on(table.status, table.availableAt),
  ],
);

export const pointCloudSettings = pgTable("point_cloud_settings", {
  assetId: uuid("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "cascade" }),
  positionX: doublePrecision("position_x").default(0).notNull(),
  positionY: doublePrecision("position_y").default(0).notNull(),
  positionZ: doublePrecision("position_z").default(0).notNull(),
  rotationX: doublePrecision("rotation_x").default(-90).notNull(),
  rotationY: doublePrecision("rotation_y").default(0).notNull(),
  rotationZ: doublePrecision("rotation_z").default(0).notNull(),
  scaleX: doublePrecision("scale_x").default(1).notNull(),
  scaleY: doublePrecision("scale_y").default(1).notNull(),
  scaleZ: doublePrecision("scale_z").default(1).notNull(),
  sourceCrs: varchar("source_crs", { length: 160 }),
  targetCrs: varchar("target_crs", { length: 160 }),
  updatedBy: uuid("updated_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  ...timestamps(),
});

export const bcfTopics = pgTable(
  "bcf_topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bcfGuid: uuid("bcf_guid").defaultRandom().notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    type: bcfTopicTypeEnum("type").default("issue").notNull(),
    status: bcfTopicStatusEnum("status").default("open").notNull(),
    priority: bcfPriorityEnum("priority").default("normal").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    externalAuthor: varchar("external_author", { length: 320 }),
    ...timestamps(),
  },
  (table) => [
    index("bcf_topics_project_id_idx").on(table.projectId),
    index("bcf_topics_status_idx").on(table.status),
    uniqueIndex("bcf_topics_project_guid_unique").on(
      table.projectId,
      table.bcfGuid,
    ),
  ],
);

export const bcfTopicComponents = pgTable(
  "bcf_topic_components",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => bcfTopics.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    globalId: varchar("global_id", { length: 64 }).notNull(),
    expressId: integer("express_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("bcf_topic_components_topic_id_idx").on(table.topicId),
    index("bcf_topic_components_asset_id_idx").on(table.assetId),
    index("bcf_topic_components_global_id_idx").on(table.globalId),
  ],
);

export const bcfComments = pgTable(
  "bcf_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bcfGuid: uuid("bcf_guid").defaultRandom().notNull(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => bcfTopics.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    externalAuthor: varchar("external_author", { length: 320 }),
    viewpointBcfGuid: uuid("viewpoint_bcf_guid"),
    comment: text("comment").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("bcf_comments_topic_id_idx").on(table.topicId),
    uniqueIndex("bcf_comments_topic_guid_unique").on(
      table.topicId,
      table.bcfGuid,
    ),
  ],
);

export const bcfViewpoints = pgTable(
  "bcf_viewpoints",
  {
    id: uuid("id").primaryKey(),
    bcfGuid: uuid("bcf_guid").defaultRandom().notNull(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => bcfTopics.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull(),
    targetDistance: doublePrecision("target_distance").notNull(),
    snapshotObjectKey: text("snapshot_object_key"),
    snapshotMediaType: varchar("snapshot_media_type", { length: 64 }),
    snapshotExpectedSize: bigint("snapshot_expected_size", {
      mode: "number",
    }),
    snapshotUploadedAt: timestamp("snapshot_uploaded_at", {
      withTimezone: true,
    }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    externalAuthor: varchar("external_author", { length: 320 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("bcf_viewpoints_topic_id_idx").on(table.topicId),
    index("bcf_viewpoints_created_by_idx").on(table.createdBy),
    uniqueIndex("bcf_viewpoints_topic_guid_unique").on(
      table.topicId,
      table.bcfGuid,
    ),
  ],
);

export const assistantThreads = pgTable(
  "assistant_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 })
      .default("Nouvelle conversation")
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    index("assistant_threads_context_idx").on(
      table.createdBy,
      table.projectId,
      table.assetId,
      table.updatedAt,
    ),
  ],
);

export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("assistant_messages_thread_ordinal_unique").on(
      table.threadId,
      table.ordinal,
    ),
    index("assistant_messages_thread_id_idx").on(table.threadId),
  ],
);

export const assetProcessingResults = pgTable("asset_processing_results", {
  assetId: uuid("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "cascade" }),
  processor: varchar("processor", { length: 80 }).notNull(),
  processorVersion: varchar("processor_version", { length: 80 }).notNull(),
  cacheKey: text("cache_key").notNull(),
  entityCount: bigint("entity_count", { mode: "number" }).notNull(),
  geometryEntityCount: bigint("geometry_entity_count", {
    mode: "number",
  }).notNull(),
  meshCount: bigint("mesh_count", { mode: "number" }).notNull(),
  cacheHit: boolean("cache_hit").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull(),
  ...timestamps(),
});

export const pointCloudProcessingResults = pgTable(
  "point_cloud_processing_results",
  {
    assetId: uuid("asset_id")
      .primaryKey()
      .references(() => assets.id, { onDelete: "cascade" }),
    format: varchar("format", { length: 40 }).notNull(),
    processor: varchar("processor", { length: 80 }).notNull(),
    processorVersion: varchar("processor_version", { length: 80 }).notNull(),
    metadataObjectKey: text("metadata_object_key").notNull(),
    hierarchyObjectKey: text("hierarchy_object_key").notNull(),
    octreeObjectKey: text("octree_object_key").notNull(),
    pointCount: bigint("point_count", { mode: "number" }).notNull(),
    spacing: doublePrecision("spacing").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("point_cloud_results_processed_at_idx").on(table.processedAt),
  ],
);

export const deletionJobs = pgTable(
  "deletion_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceId: uuid("resource_id").notNull(),
    type: deletionJobTypeEnum("type").notNull(),
    objectKeys: text("object_keys").array().notNull(),
    status: processingJobStatusEnum("status").default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 160 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("deletion_jobs_resource_type_unique").on(
      table.resourceId,
      table.type,
    ),
    index("deletion_jobs_poll_idx").on(table.status, table.availableAt),
  ],
);

export type UserRecord = typeof users.$inferSelect;
export type ProjectRecord = typeof projects.$inferSelect;
export type ProjectMemberRecord = typeof projectMembers.$inferSelect;
export type AssetRecord = typeof assets.$inferSelect;
export type ProcessingJobRecord = typeof processingJobs.$inferSelect;
export type PointCloudSettingsRecord = typeof pointCloudSettings.$inferSelect;
export type BcfTopicRecord = typeof bcfTopics.$inferSelect;
export type BcfTopicComponentRecord = typeof bcfTopicComponents.$inferSelect;
export type BcfCommentRecord = typeof bcfComments.$inferSelect;
export type BcfViewpointRecord = typeof bcfViewpoints.$inferSelect;
export type AssistantThreadRecord = typeof assistantThreads.$inferSelect;
export type AssistantMessageRecord = typeof assistantMessages.$inferSelect;
export type AssetProcessingResultRecord =
  typeof assetProcessingResults.$inferSelect;
export type PointCloudProcessingResultRecord =
  typeof pointCloudProcessingResults.$inferSelect;
export type DeletionJobRecord = typeof deletionJobs.$inferSelect;
