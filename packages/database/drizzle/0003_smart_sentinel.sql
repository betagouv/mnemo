CREATE TABLE "asset_processing_results" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"processor" varchar(80) NOT NULL,
	"processor_version" varchar(80) NOT NULL,
	"cache_key" text NOT NULL,
	"entity_count" bigint NOT NULL,
	"geometry_entity_count" bigint NOT NULL,
	"mesh_count" bigint NOT NULL,
	"cache_hit" boolean NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_processing_results" ADD CONSTRAINT "asset_processing_results_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;