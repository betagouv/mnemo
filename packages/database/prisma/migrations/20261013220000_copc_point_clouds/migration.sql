ALTER TABLE point_cloud_processing_results
  ALTER COLUMN metadata_object_key DROP NOT NULL,
  ALTER COLUMN hierarchy_object_key DROP NOT NULL,
  ALTER COLUMN octree_object_key DROP NOT NULL,
  ADD COLUMN copc_object_key TEXT;

ALTER TABLE point_cloud_processing_results
  ADD CONSTRAINT point_cloud_processing_result_artifacts_check CHECK (
    (format = 'potree-v2'
      AND metadata_object_key IS NOT NULL
      AND hierarchy_object_key IS NOT NULL
      AND octree_object_key IS NOT NULL
      AND copc_object_key IS NULL)
    OR
    (format = 'copc-v1'
      AND metadata_object_key IS NULL
      AND hierarchy_object_key IS NULL
      AND octree_object_key IS NULL
      AND copc_object_key IS NOT NULL)
  );
