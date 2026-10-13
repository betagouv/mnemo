-- Existing IFC originals are already in object storage; rendering now parses on demand.
UPDATE assets
SET status = 'ready', error_message = NULL, updated_at = now()
WHERE kind = 'ifc' AND uploaded_at IS NOT NULL
  AND status IN ('uploaded', 'processing', 'failed');

DELETE FROM processing_jobs WHERE type = 'process_ifc';
ALTER TYPE processing_job_type RENAME TO processing_job_type_old;
CREATE TYPE processing_job_type AS ENUM ('process_point_cloud');
ALTER TABLE processing_jobs
  ALTER COLUMN type TYPE processing_job_type
  USING type::text::processing_job_type;
DROP TYPE processing_job_type_old;
