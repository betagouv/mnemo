CREATE TYPE "measurement_kind" AS ENUM ('distance', 'surface');
CREATE TABLE "project_measurements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "floor_plan_id" UUID REFERENCES "project_floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "created_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(160) NOT NULL,
  "kind" "measurement_kind" NOT NULL,
  "points" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "project_measurements_project_id_updated_at_idx" ON "project_measurements"("project_id", "updated_at");
CREATE INDEX "project_measurements_floor_plan_id_idx" ON "project_measurements"("floor_plan_id");
