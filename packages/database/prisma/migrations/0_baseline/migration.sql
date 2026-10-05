-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "asset_kind" AS ENUM ('ifc', 'point_cloud');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('upload_pending', 'uploaded', 'processing', 'ready', 'failed', 'deleting');

-- CreateEnum
CREATE TYPE "bcf_priority" AS ENUM ('low', 'normal', 'high', 'critical');

-- CreateEnum
CREATE TYPE "bcf_topic_status" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "bcf_topic_type" AS ENUM ('issue', 'request', 'comment');

-- CreateEnum
CREATE TYPE "deletion_job_type" AS ENUM ('delete_asset', 'delete_project');

-- CreateEnum
CREATE TYPE "processing_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "processing_job_type" AS ENUM ('process_ifc', 'process_point_cloud');

-- CreateEnum
CREATE TYPE "project_role" AS ENUM ('owner', 'editor', 'viewer');

-- CreateTable
CREATE TABLE "asset_processing_results" (
    "asset_id" UUID NOT NULL,
    "processor" VARCHAR(80) NOT NULL,
    "processor_version" VARCHAR(80) NOT NULL,
    "cache_key" TEXT NOT NULL,
    "entity_count" BIGINT NOT NULL,
    "geometry_entity_count" BIGINT NOT NULL,
    "mesh_count" BIGINT NOT NULL,
    "cache_hit" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_processing_results_pkey" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "kind" "asset_kind" NOT NULL,
    "original_file_name" VARCHAR(512) NOT NULL,
    "media_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "original_object_key" TEXT NOT NULL,
    "status" "asset_status" NOT NULL DEFAULT 'upload_pending',
    "error_message" TEXT,
    "created_by" UUID NOT NULL,
    "upload_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL DEFAULT 'Nouvelle conversation',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bcf_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bcf_guid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_author" VARCHAR(320),
    "viewpoint_bcf_guid" UUID,

    CONSTRAINT "bcf_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bcf_topic_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic_id" UUID NOT NULL,
    "asset_id" UUID,
    "global_id" VARCHAR(64) NOT NULL,
    "express_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bcf_topic_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bcf_topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "bcf_topic_type" NOT NULL DEFAULT 'issue',
    "status" "bcf_topic_status" NOT NULL DEFAULT 'open',
    "priority" "bcf_priority" NOT NULL DEFAULT 'normal',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bcf_guid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_author" VARCHAR(320),

    CONSTRAINT "bcf_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bcf_viewpoints" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "target_distance" DOUBLE PRECISION NOT NULL,
    "snapshot_object_key" TEXT,
    "snapshot_media_type" VARCHAR(64),
    "snapshot_expected_size" BIGINT,
    "snapshot_uploaded_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bcf_guid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_author" VARCHAR(320),

    CONSTRAINT "bcf_viewpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resource_id" UUID NOT NULL,
    "type" "deletion_job_type" NOT NULL,
    "object_keys" TEXT[],
    "status" "processing_job_status" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" VARCHAR(160),
    "completed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_cloud_processing_results" (
    "asset_id" UUID NOT NULL,
    "format" VARCHAR(40) NOT NULL,
    "processor" VARCHAR(80) NOT NULL,
    "processor_version" VARCHAR(80) NOT NULL,
    "metadata_object_key" TEXT NOT NULL,
    "hierarchy_object_key" TEXT NOT NULL,
    "octree_object_key" TEXT NOT NULL,
    "point_count" BIGINT NOT NULL,
    "spacing" DOUBLE PRECISION NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_cloud_processing_results_pkey" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "point_cloud_settings" (
    "asset_id" UUID NOT NULL,
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_z" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotation_x" DOUBLE PRECISION NOT NULL DEFAULT -90,
    "rotation_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotation_z" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scale_x" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scale_y" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scale_z" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "source_crs" VARCHAR(160),
    "target_crs" VARCHAR(160),
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_cloud_settings_pkey" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "type" "processing_job_type" NOT NULL,
    "status" "processing_job_status" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" VARCHAR(160),
    "completed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "project_role" NOT NULL DEFAULT 'viewer',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_original_object_key_unique" ON "assets"("original_object_key");

-- CreateIndex
CREATE INDEX "assets_project_id_idx" ON "assets"("project_id");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assistant_messages_thread_id_idx" ON "assistant_messages"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_messages_thread_ordinal_unique" ON "assistant_messages"("thread_id", "ordinal");

-- CreateIndex
CREATE INDEX "assistant_threads_context_idx" ON "assistant_threads"("created_by", "project_id", "asset_id", "updated_at");

-- CreateIndex
CREATE INDEX "bcf_comments_topic_id_idx" ON "bcf_comments"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "bcf_comments_topic_guid_unique" ON "bcf_comments"("topic_id", "bcf_guid");

-- CreateIndex
CREATE INDEX "bcf_topic_components_asset_id_idx" ON "bcf_topic_components"("asset_id");

-- CreateIndex
CREATE INDEX "bcf_topic_components_global_id_idx" ON "bcf_topic_components"("global_id");

-- CreateIndex
CREATE INDEX "bcf_topic_components_topic_id_idx" ON "bcf_topic_components"("topic_id");

-- CreateIndex
CREATE INDEX "bcf_topics_project_id_idx" ON "bcf_topics"("project_id");

-- CreateIndex
CREATE INDEX "bcf_topics_status_idx" ON "bcf_topics"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bcf_topics_project_guid_unique" ON "bcf_topics"("project_id", "bcf_guid");

-- CreateIndex
CREATE INDEX "bcf_viewpoints_created_by_idx" ON "bcf_viewpoints"("created_by");

-- CreateIndex
CREATE INDEX "bcf_viewpoints_topic_id_idx" ON "bcf_viewpoints"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "bcf_viewpoints_topic_guid_unique" ON "bcf_viewpoints"("topic_id", "bcf_guid");

-- CreateIndex
CREATE INDEX "deletion_jobs_poll_idx" ON "deletion_jobs"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "deletion_jobs_resource_type_unique" ON "deletion_jobs"("resource_id", "type");

-- CreateIndex
CREATE INDEX "point_cloud_results_processed_at_idx" ON "point_cloud_processing_results"("processed_at");

-- CreateIndex
CREATE INDEX "processing_jobs_poll_idx" ON "processing_jobs"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "processing_jobs_asset_type_unique" ON "processing_jobs"("asset_id", "type");

-- CreateIndex
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "projects_created_by_idx" ON "projects"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_unique" ON "users"("email");

-- AddForeignKey
ALTER TABLE "asset_processing_results" ADD CONSTRAINT "asset_processing_results_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_thread_id_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "assistant_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assistant_threads" ADD CONSTRAINT "assistant_threads_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assistant_threads" ADD CONSTRAINT "assistant_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assistant_threads" ADD CONSTRAINT "assistant_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bcf_comments" ADD CONSTRAINT "bcf_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bcf_comments" ADD CONSTRAINT "bcf_comments_topic_id_bcf_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "bcf_topics"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bcf_topic_components" ADD CONSTRAINT "bcf_topic_components_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bcf_topic_components" ADD CONSTRAINT "bcf_topic_components_topic_id_bcf_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "bcf_topics"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bcf_topics" ADD CONSTRAINT "bcf_topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bcf_topics" ADD CONSTRAINT "bcf_topics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bcf_viewpoints" ADD CONSTRAINT "bcf_viewpoints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bcf_viewpoints" ADD CONSTRAINT "bcf_viewpoints_topic_id_bcf_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "bcf_topics"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "point_cloud_processing_results" ADD CONSTRAINT "point_cloud_processing_results_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "point_cloud_settings" ADD CONSTRAINT "point_cloud_settings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "point_cloud_settings" ADD CONSTRAINT "point_cloud_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
