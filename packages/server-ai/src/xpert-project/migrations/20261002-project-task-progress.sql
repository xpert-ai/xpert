-- Existing tasks have unknown progress until their owner supplies a measurement.
-- Progress does not change task status or execution history.
ALTER TABLE xpert_project_task
  ADD COLUMN IF NOT EXISTS progress double precision;
