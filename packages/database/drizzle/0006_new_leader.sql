CREATE TYPE "public"."bcf_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."bcf_topic_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."bcf_topic_type" AS ENUM('issue', 'request', 'comment');--> statement-breakpoint
CREATE TABLE "bcf_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bcf_topic_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"asset_id" uuid,
	"global_id" varchar(64) NOT NULL,
	"express_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bcf_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"type" "bcf_topic_type" DEFAULT 'issue' NOT NULL,
	"status" "bcf_topic_status" DEFAULT 'open' NOT NULL,
	"priority" "bcf_priority" DEFAULT 'normal' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bcf_comments" ADD CONSTRAINT "bcf_comments_topic_id_bcf_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."bcf_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcf_comments" ADD CONSTRAINT "bcf_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcf_topic_components" ADD CONSTRAINT "bcf_topic_components_topic_id_bcf_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."bcf_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcf_topic_components" ADD CONSTRAINT "bcf_topic_components_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcf_topics" ADD CONSTRAINT "bcf_topics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcf_topics" ADD CONSTRAINT "bcf_topics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bcf_comments_topic_id_idx" ON "bcf_comments" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "bcf_topic_components_topic_id_idx" ON "bcf_topic_components" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "bcf_topic_components_asset_id_idx" ON "bcf_topic_components" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "bcf_topic_components_global_id_idx" ON "bcf_topic_components" USING btree ("global_id");--> statement-breakpoint
CREATE INDEX "bcf_topics_project_id_idx" ON "bcf_topics" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "bcf_topics_status_idx" ON "bcf_topics" USING btree ("status");