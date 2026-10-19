BEGIN;
ALTER TABLE xpert_project_pipeline_operation ADD COLUMN IF NOT EXISTS "runtimeIntent" jsonb;
COMMIT;
