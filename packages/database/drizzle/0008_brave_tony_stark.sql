ALTER TABLE "bcf_comments" ADD COLUMN "bcf_guid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
UPDATE "bcf_comments" SET "bcf_guid" = "id";--> statement-breakpoint
ALTER TABLE "bcf_comments" ADD COLUMN "external_author" varchar(320);--> statement-breakpoint
ALTER TABLE "bcf_comments" ADD COLUMN "viewpoint_bcf_guid" uuid;--> statement-breakpoint
ALTER TABLE "bcf_topics" ADD COLUMN "bcf_guid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
UPDATE "bcf_topics" SET "bcf_guid" = "id";--> statement-breakpoint
ALTER TABLE "bcf_topics" ADD COLUMN "external_author" varchar(320);--> statement-breakpoint
ALTER TABLE "bcf_viewpoints" ADD COLUMN "bcf_guid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
UPDATE "bcf_viewpoints" SET "bcf_guid" = "id";--> statement-breakpoint
ALTER TABLE "bcf_viewpoints" ADD COLUMN "external_author" varchar(320);--> statement-breakpoint
CREATE UNIQUE INDEX "bcf_comments_topic_guid_unique" ON "bcf_comments" USING btree ("topic_id","bcf_guid");--> statement-breakpoint
CREATE UNIQUE INDEX "bcf_topics_project_guid_unique" ON "bcf_topics" USING btree ("project_id","bcf_guid");--> statement-breakpoint
CREATE UNIQUE INDEX "bcf_viewpoints_topic_guid_unique" ON "bcf_viewpoints" USING btree ("topic_id","bcf_guid");
