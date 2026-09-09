CREATE TABLE "point_cloud_settings" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"position_x" double precision DEFAULT 0 NOT NULL,
	"position_y" double precision DEFAULT 0 NOT NULL,
	"position_z" double precision DEFAULT 0 NOT NULL,
	"rotation_x" double precision DEFAULT -90 NOT NULL,
	"rotation_y" double precision DEFAULT 0 NOT NULL,
	"rotation_z" double precision DEFAULT 0 NOT NULL,
	"scale_x" double precision DEFAULT 1 NOT NULL,
	"scale_y" double precision DEFAULT 1 NOT NULL,
	"scale_z" double precision DEFAULT 1 NOT NULL,
	"source_crs" varchar(160),
	"target_crs" varchar(160),
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "point_cloud_settings" ADD CONSTRAINT "point_cloud_settings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_cloud_settings" ADD CONSTRAINT "point_cloud_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;