CREATE TABLE "project_map_references" (
  "project_id" UUID NOT NULL,
  "asset_id" UUID,
  "reference" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_map_references_pkey" PRIMARY KEY ("project_id"),
  CONSTRAINT "project_map_references_project_id_fkey" FOREIGN KEY ("project_id")
    REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_map_references_asset_id_fkey" FOREIGN KEY ("asset_id")
    REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "project_map_references_asset_id_key"
  ON "project_map_references"("asset_id");
