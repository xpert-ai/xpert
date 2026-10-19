-- A host-validated provider dispatch pins immutable native identities before native execution is created.
BEGIN;
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_native_grant (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid, "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz,
    "instanceId" uuid NOT NULL, "runId" uuid NOT NULL, "roundId" uuid NOT NULL, "nodeInstanceId" uuid NOT NULL,
    "providerActionId" uuid NOT NULL, "callKey" varchar NOT NULL, "leaseOwner" uuid NOT NULL, "leaseFence" integer NOT NULL,
    "executionId" uuid NOT NULL,
    "conversationId" uuid NOT NULL, "xpertId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "publishedVersion" varchar NOT NULL,
    "inputDigest" varchar NOT NULL, "consumedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_native_grant_call ON xpert_project_pipeline_native_grant ("providerActionId", "callKey");
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_native_grant_execution ON xpert_project_pipeline_native_grant ("executionId");
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_provider_action_grant_scope ON xpert_project_pipeline_provider_action (id, "projectId", "instanceId");
DO $$ DECLARE item record; BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('pipeline_native_grant_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('pipeline_native_grant_action_scope_fk', 'FOREIGN KEY ("providerActionId", "projectId", "instanceId") REFERENCES xpert_project_pipeline_provider_action(id, "projectId", "instanceId") ON DELETE CASCADE'),
        ('pipeline_native_grant_values_check', 'CHECK (length("callKey") > 0 AND "leaseFence" > 0 AND length("publishedVersion") > 0 AND "inputDigest" ~ ''^[a-f0-9]{64}$'')')
    ) AS constraints_to_apply(name, definition) LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('xpert_project_pipeline_native_grant') AND conname=item.name) THEN
            EXECUTE format('ALTER TABLE xpert_project_pipeline_native_grant ADD CONSTRAINT %I %s', item.name, item.definition);
        END IF;
    END LOOP;
END $$;
COMMIT;
