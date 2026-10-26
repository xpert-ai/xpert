-- Phase 2: apply before host/worker rollout; no historical task ownership is inferred.
BEGIN;
CREATE TABLE IF NOT EXISTS execution_task_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "rootId" uuid NOT NULL, "parentId" uuid,
  "tenantId" uuid NOT NULL, "organizationId" uuid,
  kind varchar NOT NULL, "resourceId" varchar NOT NULL, policy varchar NOT NULL,
  ancestors jsonb NOT NULL, "threadId" varchar, "currentExecutionId" varchar,
  attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  desired varchar NOT NULL DEFAULT 'running', revision integer NOT NULL DEFAULT 1,
  state varchar NOT NULL DEFAULT 'queued', claim uuid,
  "drainOnPause" boolean NOT NULL DEFAULT false,
  "nextCheckAt" timestamptz NOT NULL DEFAULT now(), "deliveryToken" uuid, "deliveryUntil" timestamptz,
  observation varchar, outcome varchar,
  UNIQUE (kind, "resourceId", "tenantId", "organizationId")
);
CREATE INDEX IF NOT EXISTS "IDX_execution_task_root" ON execution_task_control ("rootId");
CREATE INDEX IF NOT EXISTS "IDX_execution_task_due" ON execution_task_control ("nextCheckAt", id);
CREATE INDEX IF NOT EXISTS "IDX_execution_task_ancestors" ON execution_task_control USING gin (ancestors);
CREATE INDEX IF NOT EXISTS "IDX_execution_task_attempts" ON execution_task_control USING gin (attempts);
CREATE TABLE IF NOT EXISTS execution_task_publication (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid, "organizationId" uuid,
  "targetId" uuid NOT NULL, transport varchar NOT NULL, payload jsonb NOT NULL, result jsonb,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "publishedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "IDX_execution_task_publication_due" ON execution_task_publication (transport, "nextAttemptAt") WHERE "publishedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_execution_task_publication_target" ON execution_task_publication ("targetId");
-- Retain stable task ids and facts from the earlier schema.
ALTER TABLE execution_task_control ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE execution_task_publication
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "tenantId" uuid,
  ADD COLUMN IF NOT EXISTS "organizationId" uuid;
UPDATE execution_task_publication publication
SET "tenantId" = task."tenantId", "organizationId" = task."organizationId"
FROM execution_task_control task
WHERE task.id = publication."targetId" AND publication."tenantId" IS NULL;
DO $$
DECLARE legacy_primary_key text;
BEGIN
  -- Orphaned or conflicting publications cannot acquire guessed ownership.
  IF EXISTS (
    SELECT 1 FROM execution_task_publication publication
    LEFT JOIN execution_task_control task ON task.id = publication."targetId"
    WHERE task.id IS NULL OR publication."tenantId" IS DISTINCT FROM task."tenantId"
      OR publication."organizationId" IS DISTINCT FROM task."organizationId"
  ) THEN
    RAISE EXCEPTION 'Task publication ownership requires repair before migration';
  END IF;
  SELECT c.conname INTO legacy_primary_key
  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'execution_task_publication'::regclass AND c.contype = 'p'
    AND cardinality(c.conkey) = 1 AND a.attname = 'targetId';
  IF legacy_primary_key IS NOT NULL THEN
    EXECUTE format('ALTER TABLE execution_task_publication DROP CONSTRAINT %I', legacy_primary_key);
    ALTER TABLE execution_task_publication ADD PRIMARY KEY (id);
  END IF;
END $$;
-- Audit metadata is new; timestamps record migration time, actors remain unknown.
DO $$
DECLARE table_name text; relation record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['execution_task_control', 'execution_task_publication'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "createdById" uuid, ADD COLUMN IF NOT EXISTS "updatedById" uuid', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "tenantId" DROP NOT NULL', table_name);
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
        WHERE c.conrelid = table_name::regclass AND c.contype = 'f' AND a.attname = relation.column_name
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s ON UPDATE %s',
          table_name, relation.column_name, relation.target_table, relation.delete_action, relation.update_action);
      END IF;
    END LOOP;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("tenantId")', 'IDX_' || table_name || '_tenant', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("organizationId")', 'IDX_' || table_name || '_organization', table_name);
  END LOOP;
END $$;
COMMIT;
