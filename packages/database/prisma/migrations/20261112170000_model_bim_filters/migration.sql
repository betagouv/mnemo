CREATE TABLE "model_bim_filters" (
  "asset_id" UUID NOT NULL,
  "settings" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "model_bim_filters_pkey" PRIMARY KEY ("asset_id"),
  CONSTRAINT "model_bim_filters_asset_id_fkey" FOREIGN KEY ("asset_id")
    REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
