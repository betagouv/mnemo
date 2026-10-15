-- Keep original uploads and S3 deletion references intact. Remove legacy
-- point-cloud assets through Mnemo before applying this schema cleanup.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM point_cloud_processing_results
    WHERE format <> 'copc-v1'
       OR copc_object_key IS NULL
       OR metadata_object_key IS NOT NULL
       OR hierarchy_object_key IS NOT NULL
       OR octree_object_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Legacy point-cloud results remain. Delete those assets through the existing app, wait for S3 cleanup, then retry this migration.';
  END IF;
END $$;

ALTER TABLE point_cloud_processing_results
  DROP CONSTRAINT point_cloud_processing_result_artifacts_check,
  DROP COLUMN metadata_object_key,
  DROP COLUMN hierarchy_object_key,
  DROP COLUMN octree_object_key,
  ALTER COLUMN copc_object_key SET NOT NULL;

ALTER TABLE point_cloud_processing_results
  ADD CONSTRAINT point_cloud_processing_result_format_check
  CHECK (format = 'copc-v1');
