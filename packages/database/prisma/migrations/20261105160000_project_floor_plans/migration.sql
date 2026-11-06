CREATE TABLE "project_floor_plans" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
 "asset_id" UUID NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
 "name" VARCHAR(160) NOT NULL,
 "storey_id" INTEGER NOT NULL CHECK (storey_id > 0),
 "storey_name" VARCHAR(512) NOT NULL,
 "style" JSONB NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "project_floor_plans_project_id_updated_at_idx" ON "project_floor_plans"("project_id", "updated_at");
