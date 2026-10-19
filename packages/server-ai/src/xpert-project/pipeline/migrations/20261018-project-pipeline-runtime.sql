-- Apply after 20261018-project-pipeline.sql. A queued operation is a durable outbox entry.
BEGIN;
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_operation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz,
    "instanceId" uuid NOT NULL, "runId" uuid NOT NULL, "roundId" uuid NOT NULL, "nodeInstanceId" uuid NOT NULL,
    attempt integer NOT NULL,
    kind varchar NOT NULL,
    "handlerRef" varchar NOT NULL, "completionRef" varchar, "snapshotDigest" varchar NOT NULL,
    context jsonb NOT NULL,
    state varchar NOT NULL,
    receipt jsonb, completion jsonb, "leaseOwner" uuid, "leaseFence" integer NOT NULL DEFAULT 0,
    "leaseExpiresAt" timestamptz, "nextCheckAt" timestamptz NOT NULL,
    UNIQUE ("nodeInstanceId", attempt)
);
CREATE INDEX IF NOT EXISTS pipeline_operation_outbox ON xpert_project_pipeline_operation ("nextCheckAt")
    WHERE state IN ('queued','dispatching','pending','unknown','succeeded') AND "deletedAt" IS NULL;
ALTER TABLE xpert_project_pipeline_operation ADD COLUMN IF NOT EXISTS "dispatchStartedAt" timestamptz;
ALTER TABLE xpert_project_pipeline_operation ADD COLUMN IF NOT EXISTS "terminalObservedAt" timestamptz;
-- Soft deletion is not proof that an external execution stopped.
CREATE INDEX IF NOT EXISTS pipeline_operation_admission ON xpert_project_pipeline_operation ("tenantId", "runId", "nodeInstanceId")
    WHERE kind = 'operation' AND state IN ('dispatching','pending','unknown') AND "terminalObservedAt" IS NULL;
ALTER TABLE xpert_project_pipeline_operation ADD COLUMN IF NOT EXISTS "assistantIntent" jsonb;
ALTER TABLE xpert_project_pipeline_operation ADD COLUMN IF NOT EXISTS "cancelRequestedAt" timestamptz;
ALTER TABLE xpert_project_pipeline_operation ADD COLUMN IF NOT EXISTS "cancelDispatchedAt" timestamptz;
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_decision (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz,
    "nodeInstanceId" uuid NOT NULL, "roundId" uuid NOT NULL, "operationId" uuid NOT NULL,
    kind varchar NOT NULL, "policyRef" varchar NOT NULL,
    "inputDigest" varchar NOT NULL, generation integer NOT NULL, outcome varchar NOT NULL,
    evidence jsonb NOT NULL, "actorId" uuid NOT NULL,
    UNIQUE ("nodeInstanceId", generation)
);
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_attention (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz,
    "instanceId" uuid NOT NULL, "nodeInstanceId" uuid NOT NULL, "roundId" uuid NOT NULL,
    kind varchar NOT NULL, state varchar NOT NULL,
    revision integer NOT NULL DEFAULT 1, "reasonCode" varchar NOT NULL, "inputDigest" varchar NOT NULL,
    generation integer NOT NULL, "policyRef" varchar, "candidateRoleKey" varchar, outcomes jsonb NOT NULL DEFAULT '[]', "decisionId" uuid,
    UNIQUE ("nodeInstanceId", kind)
);

-- Validate existing rows too; never leave a precreated table with weaker guarantees.
DO $$ DECLARE item record; BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('xpert_project_pipeline_operation', 'pipeline_operation_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_operation', 'pipeline_operation_instance_scope_fk', 'FOREIGN KEY ("instanceId", "projectId") REFERENCES xpert_project_pipeline_instance(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_operation', 'pipeline_operation_run_scope_fk', 'FOREIGN KEY ("runId", "projectId") REFERENCES xpert_project_pipeline_run(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_operation', 'pipeline_operation_round_scope_fk', 'FOREIGN KEY ("roundId", "projectId") REFERENCES xpert_project_pipeline_round(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_operation', 'pipeline_operation_node_scope_fk', 'FOREIGN KEY ("nodeInstanceId", "projectId") REFERENCES xpert_project_pipeline_node(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_decision', 'pipeline_decision_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_decision', 'pipeline_decision_node_scope_fk', 'FOREIGN KEY ("nodeInstanceId", "projectId") REFERENCES xpert_project_pipeline_node(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_decision', 'pipeline_decision_round_scope_fk', 'FOREIGN KEY ("roundId", "projectId") REFERENCES xpert_project_pipeline_round(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_attention', 'pipeline_attention_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_attention', 'pipeline_attention_instance_scope_fk', 'FOREIGN KEY ("instanceId", "projectId") REFERENCES xpert_project_pipeline_instance(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_attention', 'pipeline_attention_node_scope_fk', 'FOREIGN KEY ("nodeInstanceId", "projectId") REFERENCES xpert_project_pipeline_node(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_attention', 'pipeline_attention_round_scope_fk', 'FOREIGN KEY ("roundId", "projectId") REFERENCES xpert_project_pipeline_round(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_operation', 'pipeline_operation_values_check', 'CHECK (attempt > 0 AND attempt <= 20 AND "leaseFence" >= 0 AND kind IN (''operation'',''policy'',''subscription'') AND state IN (''queued'',''dispatching'',''pending'',''unknown'',''succeeded'',''failed'',''accepted'',''rejected'',''cancelled'',''superseded''))'),
        ('xpert_project_pipeline_decision', 'pipeline_decision_values_check', 'CHECK (generation > 0 AND kind IN (''policy'',''human''))'),
        ('xpert_project_pipeline_attention', 'pipeline_attention_values_check', 'CHECK (revision > 0 AND generation > 0 AND kind IN (''human'',''blocked'',''unknown'') AND state IN (''open'',''resolved'',''superseded''))')
    ) AS constraints_to_apply(table_name, constraint_name, definition) LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass(item.table_name) AND conname=item.constraint_name) THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', item.table_name, item.constraint_name, item.definition);
        END IF;
    END LOOP;
END $$;

COMMIT;
