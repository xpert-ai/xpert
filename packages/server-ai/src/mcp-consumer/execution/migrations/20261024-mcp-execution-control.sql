BEGIN;
-- Legacy task rows intentionally keep NULL control: status alone cannot attest handler exit.
ALTER TABLE mcp_task ADD COLUMN IF NOT EXISTS control jsonb;
ALTER TABLE mcp_task ADD COLUMN IF NOT EXISTS "nextControlAt" timestamptz;
CREATE INDEX IF NOT EXISTS mcp_task_control_due ON mcp_task ("nextControlAt") WHERE "nextControlAt" IS NOT NULL;
CREATE TABLE IF NOT EXISTS mcp_remote_operation (
    id uuid PRIMARY KEY,
    "tenantId" uuid NOT NULL,
    "organizationId" uuid,
    "operationKey" varchar NOT NULL,
    "targetId" uuid NOT NULL,
    generation uuid NOT NULL,
    record jsonb NOT NULL,
    "nextControlAt" timestamptz,
    CONSTRAINT mcp_remote_operation_scope_key UNIQUE ("tenantId", "operationKey")
);
CREATE INDEX IF NOT EXISTS mcp_operation_control_due ON mcp_remote_operation ("nextControlAt") WHERE "nextControlAt" IS NOT NULL;
-- Preserve operation identity, generation and control data when upgrading the earlier table.
ALTER TABLE mcp_remote_operation ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE mcp_remote_operation ALTER COLUMN "tenantId" DROP NOT NULL;
-- Historical timestamps record migration time; unknown actors remain NULL.
ALTER TABLE mcp_remote_operation
    ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS "createdById" uuid,
    ADD COLUMN IF NOT EXISTS "updatedById" uuid;
DO $$
DECLARE relation record;
BEGIN
    FOR relation IN SELECT * FROM (VALUES
        ('createdById', 'user', 'RESTRICT', 'NO ACTION'),
        ('updatedById', 'user', 'RESTRICT', 'NO ACTION'),
        ('tenantId', 'tenant', 'CASCADE', 'NO ACTION'),
        ('organizationId', 'organization', 'CASCADE', 'CASCADE')
    ) AS relations(column_name, target_table, delete_action, update_action)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_attribute a
                ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.conrelid = 'mcp_remote_operation'::regclass
                AND c.contype = 'f' AND a.attname = relation.column_name
        ) THEN
            EXECUTE format('ALTER TABLE mcp_remote_operation ADD FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s ON UPDATE %s',
                relation.column_name, relation.target_table, relation.delete_action, relation.update_action);
        END IF;
    END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_mcp_operation_tenant" ON mcp_remote_operation ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_mcp_operation_organization" ON mcp_remote_operation ("organizationId");
COMMIT;
