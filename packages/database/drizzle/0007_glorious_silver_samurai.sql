CREATE TABLE "bcf_viewpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"target_distance" double precision NOT NULL,
	"snapshot_object_key" text,
	"snapshot_media_type" varchar(64),
	"snapshot_expected_size" bigint,
	"snapshot_uploaded_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bcf_viewpoints" ADD CONSTRAINT "bcf_viewpoints_topic_id_bcf_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."bcf_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcf_viewpoints" ADD CONSTRAINT "bcf_viewpoints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bcf_viewpoints_topic_id_idx" ON "bcf_viewpoints" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "bcf_viewpoints_created_by_idx" ON "bcf_viewpoints" USING btree ("created_by");