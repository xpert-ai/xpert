-- Run before enabling the public control projection. No historical execution evidence is inferred.
BEGIN;
CREATE TABLE IF NOT EXISTS chat_thread_control_projection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "createdById" uuid,
  "updatedById" uuid,
  "threadId" varchar(100) NOT NULL,
  "tenantId" uuid,
  "organizationId" uuid,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  fingerprint varchar(64) NOT NULL
);
-- Preserve existing revisions/fingerprints when upgrading the threadId-primary-key schema.
-- New audit timestamps record migration time; historical actors remain unknown (NULL).
ALTER TABLE chat_thread_control_projection
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "createdById" uuid,
  ADD COLUMN IF NOT EXISTS "updatedById" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_thread_control_projection_thread" ON chat_thread_control_projection ("threadId");
DO $$
DECLARE legacy_primary_key text;
BEGIN
  SELECT c.conname INTO legacy_primary_key
  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'chat_thread_control_projection'::regclass AND c.contype = 'p'
    AND cardinality(c.conkey) = 1 AND a.attname = 'threadId';
  IF legacy_primary_key IS NOT NULL THEN
    EXECUTE format('ALTER TABLE chat_thread_control_projection DROP CONSTRAINT %I', legacy_primary_key);
    ALTER TABLE chat_thread_control_projection ADD PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE chat_thread_control_projection ALTER COLUMN "tenantId" DROP NOT NULL;
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
      WHERE c.conrelid = 'chat_thread_control_projection'::regclass AND c.contype = 'f'
        AND a.attname = relation.column_name
    ) THEN
      EXECUTE format('ALTER TABLE chat_thread_control_projection ADD FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s ON UPDATE %s',
        relation.column_name, relation.target_table, relation.delete_action, relation.update_action);
    END IF;
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_thread_control_projection_tenant" ON chat_thread_control_projection ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_thread_control_projection_organization" ON chat_thread_control_projection ("organizationId");
COMMIT;
