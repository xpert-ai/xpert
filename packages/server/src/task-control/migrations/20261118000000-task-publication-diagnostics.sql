-- Preserve historical publications and results. Missing evidence is never completion.
ALTER TABLE execution_task_publication ADD COLUMN IF NOT EXISTS diagnostic jsonb;
