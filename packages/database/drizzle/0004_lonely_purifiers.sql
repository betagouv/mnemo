CREATE TYPE "public"."deletion_job_type" AS ENUM('delete_asset', 'delete_project');--> statement-breakpoint
ALTER TYPE "public"."asset_status" ADD VALUE 'deleting';--> statement-breakpoint
CREATE TABLE "deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"type" "deletion_job_type" NOT NULL,
	"object_keys" text[] NOT NULL,
	"status" "processing_job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(160),
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_jobs_resource_type_unique" ON "deletion_jobs" USING btree ("resource_id","type");--> statement-breakpoint
CREATE INDEX "deletion_jobs_poll_idx" ON "deletion_jobs" USING btree ("status","available_at");