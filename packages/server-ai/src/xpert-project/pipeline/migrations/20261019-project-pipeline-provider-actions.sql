-- Additive outbox. Do not drop while an effect or its projection is still unconfirmed.
BEGIN;
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_provider_action (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL, "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz,
    "instanceId" uuid NOT NULL, "runId" uuid NOT NULL, "roundId" uuid NOT NULL, "nodeInstanceId" uuid NOT NULL,
    "providerRef" varchar NOT NULL, "sourceKey" varchar NOT NULL, digest varchar NOT NULL,
    input jsonb NOT NULL, node jsonb NOT NULL, state varchar NOT NULL, receipt jsonb, "reasonCode" varchar,
    "leaseOwner" uuid, "leaseFence" integer NOT NULL DEFAULT 0, "leaseExpiresAt" timestamptz,
    "dispatchStartedAt" timestamptz, "nextCheckAt" timestamptz NOT NULL, "projectionPending" boolean NOT NULL DEFAULT false
);
DO $$ DECLARE item record; BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('pipeline_provider_action_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('pipeline_provider_action_instance_scope_fk', 'FOREIGN KEY ("instanceId", "projectId") REFERENCES xpert_project_pipeline_instance(id, "projectId") ON DELETE CASCADE'),
        ('pipeline_provider_action_run_scope_fk', 'FOREIGN KEY ("runId", "projectId") REFERENCES xpert_project_pipeline_run(id, "projectId") ON DELETE CASCADE'),
        ('pipeline_provider_action_round_scope_fk', 'FOREIGN KEY ("roundId", "projectId") REFERENCES xpert_project_pipeline_round(id, "projectId") ON DELETE CASCADE'),
        ('pipeline_provider_action_node_scope_fk', 'FOREIGN KEY ("nodeInstanceId", "projectId") REFERENCES xpert_project_pipeline_node(id, "projectId") ON DELETE CASCADE'),
        ('pipeline_provider_action_values_check', 'CHECK ("leaseFence" >= 0 AND state IN (''queued'',''dispatching'',''pending'',''unknown'',''succeeded'',''failed'',''superseded''))')
    ) AS constraints_to_apply(name, definition) LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('xpert_project_pipeline_provider_action') AND conname=item.name) THEN
            EXECUTE format('ALTER TABLE xpert_project_pipeline_provider_action ADD CONSTRAINT %I %s', item.name, item.definition);
        END IF;
    END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_one_active_provider_action
    ON xpert_project_pipeline_provider_action ("projectId", "nodeInstanceId")
    WHERE state IN ('queued','dispatching','pending','unknown');
CREATE INDEX IF NOT EXISTS pipeline_provider_action_recovery
    ON xpert_project_pipeline_provider_action ("nextCheckAt")
    WHERE state IN ('queued','dispatching','pending','unknown') OR "projectionPending";
COMMIT;
