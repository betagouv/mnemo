-- BCF vocabulary is project-defined. No legacy enum mapping is retained.
ALTER TABLE "bcf_topics" ALTER COLUMN "type" DROP DEFAULT, ALTER COLUMN "status" DROP DEFAULT, ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "bcf_topics" ALTER COLUMN "type" TYPE VARCHAR(100) USING "type"::text, ALTER COLUMN "status" TYPE VARCHAR(100) USING "status"::text, ALTER COLUMN "priority" TYPE VARCHAR(100) USING "priority"::text;
ALTER TABLE "bcf_topics" ALTER COLUMN "type" SET DEFAULT 'Issue', ALTER COLUMN "status" SET DEFAULT 'Open', ALTER COLUMN "priority" SET DEFAULT 'Normal';
DROP TYPE "bcf_topic_type";
DROP TYPE "bcf_topic_status";
DROP TYPE "bcf_priority";
ALTER TABLE "bcf_topics" ADD COLUMN "number" SERIAL NOT NULL, ADD COLUMN "assigned_to" VARCHAR(320), ADD COLUMN "due_date" DATE, ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "modified_author" VARCHAR(320);
ALTER TABLE "projects" ADD COLUMN "bcf_options" JSONB;
ALTER TYPE "deletion_job_type" ADD VALUE 'delete_bcf_upload';
CREATE TABLE "bcf_snapshot_uploads" (
  "id" UUID NOT NULL PRIMARY KEY,
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "object_key" TEXT NOT NULL UNIQUE,
  "media_type" VARCHAR(64) NOT NULL,
  "size_bytes" INTEGER NOT NULL CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  "expires_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "bcf_snapshot_uploads_expires_at_idx" ON "bcf_snapshot_uploads"("expires_at");
