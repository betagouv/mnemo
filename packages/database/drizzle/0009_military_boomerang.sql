CREATE TABLE "point_cloud_processing_results" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"format" varchar(40) NOT NULL,
	"processor" varchar(80) NOT NULL,
	"processor_version" varchar(80) NOT NULL,
	"metadata_object_key" text NOT NULL,
	"hierarchy_object_key" text NOT NULL,
	"octree_object_key" text NOT NULL,
	"point_count" bigint NOT NULL,
	"spacing" double precision NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "point_cloud_processing_results" ADD CONSTRAINT "point_cloud_processing_results_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "point_cloud_results_processed_at_idx" ON "point_cloud_processing_results" USING btree ("processed_at");