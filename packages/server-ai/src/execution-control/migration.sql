-- Stage 1 schema; apply before host/worker rollout. No historical ownership is inferred.
BEGIN;
CREATE TABLE IF NOT EXISTS execution_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "createdById" uuid,
  "updatedById" uuid,
  "tenantId" uuid,
  "organizationId" uuid,
  "executionId" uuid NOT NULL,
  "threadId" varchar NOT NULL,
  "rootExecutionId" uuid NOT NULL,
  ownership jsonb NOT NULL,
  ancestors jsonb NOT NULL,
  desired varchar NOT NULL DEFAULT 'running',
  revision integer NOT NULL DEFAULT 1,
  "graphEnded" boolean NOT NULL DEFAULT false,
  work jsonb NOT NULL DEFAULT '[]'::jsonb
);
-- Preserve existing control facts when upgrading the initial executionId-primary-key schema.
-- New audit timestamps record migration time; historical actors remain unknown (NULL).
ALTER TABLE execution_control
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "createdById" uuid,
  ADD COLUMN IF NOT EXISTS "updatedById" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_execution_control_execution" ON execution_control ("executionId");
DO $$
DECLARE legacy_primary_key text;
BEGIN
  SELECT c.conname INTO legacy_primary_key
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'execution_control'::regclass AND c.contype = 'p'
    AND cardinality(c.conkey) = 1 AND a.attname = 'executionId';
  IF legacy_primary_key IS NOT NULL THEN
    EXECUTE format('ALTER TABLE execution_control DROP CONSTRAINT %I', legacy_primary_key);
    ALTER TABLE execution_control ADD PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE execution_control ALTER COLUMN "tenantId" DROP NOT NULL;
-- Match TenantOrganizationBaseEntity relations, including their deletion policies.
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
      WHERE c.conrelid = 'execution_control'::regclass AND c.contype = 'f'
        AND a.attname = relation.column_name
    ) THEN
      EXECUTE format('ALTER TABLE execution_control ADD FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s ON UPDATE %s',
        relation.column_name, relation.target_table, relation.delete_action, relation.update_action);
    END IF;
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_execution_control_root" ON execution_control ("rootExecutionId");
CREATE INDEX IF NOT EXISTS "IDX_execution_control_tenant" ON execution_control ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_execution_control_organization" ON execution_control ("organizationId");
COMMIT;
