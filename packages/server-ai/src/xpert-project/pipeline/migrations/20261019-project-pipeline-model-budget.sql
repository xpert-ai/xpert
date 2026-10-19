-- Native model admission is additive. Deploy to every worker before enabling budgeted configurations.
BEGIN;
ALTER TABLE xpert_project_pipeline_instance ADD COLUMN IF NOT EXISTS "nativeModelBudget" jsonb;
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_model_reservation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid, "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "deletedAt" timestamptz,
    "instanceId" uuid NOT NULL, "operationId" uuid NOT NULL, "executionId" uuid NOT NULL, "requestId" uuid NOT NULL,
    state varchar NOT NULL, "reservedTokens" bigint NOT NULL, "actualTokens" bigint,
    UNIQUE ("operationId", "requestId")
);
CREATE INDEX IF NOT EXISTS pipeline_model_budget_instance ON xpert_project_pipeline_model_reservation ("instanceId");
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_operation_budget_scope ON xpert_project_pipeline_operation (id, "projectId", "instanceId");
DO $$ DECLARE item record; BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('pipeline_model_reservation_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('pipeline_model_reservation_operation_scope_fk', 'FOREIGN KEY ("operationId", "projectId", "instanceId") REFERENCES xpert_project_pipeline_operation(id, "projectId", "instanceId") ON DELETE CASCADE'),
        ('pipeline_model_reservation_values_check', 'CHECK (state IN (''held'', ''settled'') AND "reservedTokens" > 0 AND ((state = ''held'' AND "actualTokens" IS NULL) OR (state = ''settled'' AND "actualTokens" > 0)))')
    ) AS constraints_to_apply(name, definition) LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('xpert_project_pipeline_model_reservation') AND conname=item.name) THEN
            EXECUTE format('ALTER TABLE xpert_project_pipeline_model_reservation ADD CONSTRAINT %I %s', item.name, item.definition);
        END IF;
    END LOOP;
END $$;
COMMIT;
