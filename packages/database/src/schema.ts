import { assetKinds, assetStatuses } from "@mnemo/domain/asset";
import {
  processingJobStatuses,
  processingJobTypes,
} from "@mnemo/domain/processing-job";
import { projectRoles } from "@mnemo/domain/project";
import {
  bigint,
  boolean,
  index,
  integer,
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

export type UserRecord = typeof users.$inferSelect;
export type ProjectRecord = typeof projects.$inferSelect;
export type ProjectMemberRecord = typeof projectMembers.$inferSelect;
export type AssetRecord = typeof assets.$inferSelect;
export type ProcessingJobRecord = typeof processingJobs.$inferSelect;
export type AssetProcessingResultRecord =
  typeof assetProcessingResults.$inferSelect;
