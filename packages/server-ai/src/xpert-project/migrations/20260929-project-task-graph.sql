-- Additive migration; does not change existing task identity, state or history.
ALTER TABLE xpert_project_task
  ADD COLUMN IF NOT EXISTS "providerKey" varchar,
  ADD COLUMN IF NOT EXISTS "sourceKey" varchar,
  ADD COLUMN IF NOT EXISTS "sourceRevision" varchar,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kind varchar NOT NULL DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS "parentTaskId" uuid,
  ADD COLUMN IF NOT EXISTS "predecessorIds" json NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "plannedStartAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "plannedEndAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "estimatedDurationMs" double precision,
  ADD COLUMN IF NOT EXISTS diagnostic text;
CREATE UNIQUE INDEX IF NOT EXISTS project_task_provider_source
  ON xpert_project_task ("projectId", "providerKey", "sourceKey");
ALTER TABLE xpert_project_task_execution ADD COLUMN IF NOT EXISTS "sourceKey" varchar;
CREATE UNIQUE INDEX IF NOT EXISTS project_task_execution_source
  ON xpert_project_task_execution ("taskId", "sourceKey");
