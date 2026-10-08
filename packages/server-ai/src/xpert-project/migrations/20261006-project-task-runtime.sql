-- Apply before deploying the host. Old attempts remain native; no runtime identity is inferred.
BEGIN;
ALTER TABLE xpert_project_task ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE xpert_project_task_execution
    ADD COLUMN IF NOT EXISTS "invocationId" uuid,
    ADD COLUMN IF NOT EXISTS "dispatchRequestId" uuid,
    ADD COLUMN IF NOT EXISTS "dispatchState" varchar,
    ADD COLUMN IF NOT EXISTS "specificationSnapshot" jsonb,
    ADD COLUMN IF NOT EXISTS purpose jsonb,
    ADD COLUMN IF NOT EXISTS "dispatchIntent" jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_project_task_execution_invocation"
    ON xpert_project_task_execution ("invocationId");
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_project_task_execution_dispatch"
    ON xpert_project_task_execution ("projectId", "createdById", "dispatchRequestId");
COMMIT;
