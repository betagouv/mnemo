CREATE TYPE "public"."asset_kind" AS ENUM('ifc', 'point_cloud');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('upload_pending', 'uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"original_file_name" varchar(512) NOT NULL,
	"media_type" varchar(255) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"original_object_key" text NOT NULL,
	"status" "asset_status" DEFAULT 'upload_pending' NOT NULL,
	"error_message" text,
	"created_by" uuid NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_project_id_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "assets_status_idx" ON "assets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_original_object_key_unique" ON "assets" USING btree ("original_object_key");