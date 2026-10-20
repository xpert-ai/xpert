-- Apply before deploying Pipeline writers. Existing Task providers remain compatible.
-- Full snapshots are instance scoped; removals never rewrite business status or execution history.
BEGIN;
-- TypeORM schema synchronization may already have created these tables without SQL-only constraints.
DO $$ DECLARE name text; BEGIN
    FOREACH name IN ARRAY ARRAY['definition','instance','run','round','node'] LOOP
        IF to_regclass('xpert_project_pipeline_' || name) IS NOT NULL THEN
            EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (id, "projectId")',
                'pipeline_' || name || '_project_identity', 'xpert_project_pipeline_' || name);
        END IF;
    END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_definition (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "ownerRef" varchar NOT NULL, "templateKey" varchar NOT NULL, version varchar NOT NULL,
    digest varchar NOT NULL, definition jsonb NOT NULL,
    UNIQUE ("projectId", "ownerRef", "templateKey", version), CONSTRAINT pipeline_definition_project_identity UNIQUE(id, "projectId")
);
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_binding (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "definitionId" uuid NOT NULL, revision integer NOT NULL DEFAULT 1,
    configuration jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_instance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "ownerRef" varchar NOT NULL, "sourceKey" varchar NOT NULL,
    authority varchar NOT NULL,
    title varchar NOT NULL, "definitionId" uuid NOT NULL, subject jsonb NOT NULL,
    "currentRunId" uuid, "currentRoundId" uuid,
    "sourceEpoch" uuid, "sourceSequence" bigint, "snapshotDigest" varchar,
    revision integer NOT NULL DEFAULT 0,

    UNIQUE ("projectId", "ownerRef", "sourceKey"), CONSTRAINT pipeline_instance_project_identity UNIQUE(id, "projectId")
);
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_run (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "instanceId" uuid NOT NULL, "sourceKey" varchar NOT NULL, "definitionId" uuid NOT NULL,
    "bindingSnapshot" jsonb, state varchar NOT NULL,

    UNIQUE ("instanceId", "sourceKey"), CONSTRAINT pipeline_run_project_identity UNIQUE(id, "projectId")
);
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_round (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "runId" uuid NOT NULL, "sourceKey" varchar NOT NULL,
    sequence integer NOT NULL, generation integer NOT NULL,
    "inputDigest" varchar NOT NULL, "subjectVersionSet" jsonb NOT NULL, state varchar NOT NULL,
    edges jsonb NOT NULL DEFAULT '[]',

    UNIQUE ("runId", sequence), UNIQUE ("runId", "sourceKey"), CONSTRAINT pipeline_round_project_identity UNIQUE(id, "projectId")
);
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_node (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "roundId" uuid NOT NULL, "sourceKey" varchar NOT NULL, "nodeKey" varchar NOT NULL, "expansionKey" varchar NOT NULL,
    disposition varchar NOT NULL DEFAULT 'active', projection jsonb NOT NULL, "taskIds" jsonb NOT NULL DEFAULT '[]',

    UNIQUE ("roundId", "sourceKey"), UNIQUE ("roundId", "nodeKey", "expansionKey"), CONSTRAINT pipeline_node_project_identity UNIQUE(id, "projectId")
);
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "instanceId" uuid NOT NULL, revision integer NOT NULL, type varchar NOT NULL, payload jsonb NOT NULL,
    UNIQUE ("instanceId", revision)
);
ALTER TABLE xpert_project_task
    ADD COLUMN IF NOT EXISTS "controlKind" varchar NOT NULL DEFAULT 'ordinary',
    ADD COLUMN IF NOT EXISTS "pipelineInstanceId" uuid,
    ADD COLUMN IF NOT EXISTS "pipelineDisposition" varchar;
UPDATE xpert_project_task SET "controlKind"='provider' WHERE "controlKind"='ordinary' AND "providerKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_task_project_identity ON xpert_project_task (id, "projectId");
CREATE INDEX IF NOT EXISTS pipeline_task_instance ON xpert_project_task ("projectId", "pipelineInstanceId");
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_task_link (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "nodeInstanceId" uuid NOT NULL, "taskId" uuid NOT NULL, relation varchar NOT NULL DEFAULT 'primary',

    UNIQUE ("nodeInstanceId", "taskId")
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pipeline_task_instance_fk' AND conrelid='xpert_project_task'::regclass) THEN
        ALTER TABLE xpert_project_task ADD CONSTRAINT pipeline_task_instance_fk
            FOREIGN KEY ("pipelineInstanceId", "projectId") REFERENCES xpert_project_pipeline_instance(id, "projectId") ON DELETE CASCADE;
    END IF;
    ALTER TABLE xpert_project_task DROP CONSTRAINT IF EXISTS pipeline_task_control_check;
        ALTER TABLE xpert_project_task ADD CONSTRAINT pipeline_task_control_check CHECK (
            "controlKind" IN ('ordinary','provider','pipeline') AND
            ("controlKind" <> 'pipeline' OR "pipelineInstanceId" IS NOT NULL) AND
            ("pipelineInstanceId" IS NULL OR "projectId" IS NOT NULL) AND
            ("pipelineDisposition" IS NULL OR ("pipelineInstanceId" IS NOT NULL AND "pipelineDisposition" IN ('active','removed','excluded','superseded')))
        );
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_one_active_run ON xpert_project_pipeline_run ("instanceId")
    WHERE state IN ('pending','active','waiting','cancelling') AND "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS pipeline_instance_scope ON xpert_project_pipeline_instance ("tenantId", "organizationId", "projectId");
CREATE TABLE IF NOT EXISTS xpert_project_pipeline_refresh (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid,
    "projectId" uuid NOT NULL,
    "createdById" uuid, "updatedById" uuid,
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "deletedAt" timestamptz,
    "ownerRef" varchar NOT NULL, "sourceKey" varchar NOT NULL, "requestId" uuid NOT NULL,
    state varchar NOT NULL, "errorCode" varchar,
    UNIQUE ("projectId", "ownerRef", "sourceKey")
);

-- Validate existing rows too; never leave a precreated table with weaker guarantees.
DO $$ DECLARE item record; BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('xpert_project_pipeline_definition', 'pipeline_definition_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_binding', 'pipeline_binding_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_instance', 'pipeline_instance_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_run', 'pipeline_run_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_round', 'pipeline_round_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_node', 'pipeline_node_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_event', 'pipeline_event_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_task_link', 'pipeline_task_link_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_refresh', 'pipeline_refresh_project_fk', 'FOREIGN KEY ("projectId") REFERENCES xpert_project(id) ON DELETE CASCADE'),
        ('xpert_project_pipeline_binding', 'pipeline_binding_definition_scope_fk', 'FOREIGN KEY ("definitionId", "projectId") REFERENCES xpert_project_pipeline_definition(id, "projectId")'),
        ('xpert_project_pipeline_instance', 'pipeline_instance_definition_scope_fk', 'FOREIGN KEY ("definitionId", "projectId") REFERENCES xpert_project_pipeline_definition(id, "projectId")'),
        ('xpert_project_pipeline_run', 'pipeline_run_instance_scope_fk', 'FOREIGN KEY ("instanceId", "projectId") REFERENCES xpert_project_pipeline_instance(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_run', 'pipeline_run_definition_scope_fk', 'FOREIGN KEY ("definitionId", "projectId") REFERENCES xpert_project_pipeline_definition(id, "projectId")'),
        ('xpert_project_pipeline_round', 'pipeline_round_run_scope_fk', 'FOREIGN KEY ("runId", "projectId") REFERENCES xpert_project_pipeline_run(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_node', 'pipeline_node_round_scope_fk', 'FOREIGN KEY ("roundId", "projectId") REFERENCES xpert_project_pipeline_round(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_event', 'pipeline_event_instance_scope_fk', 'FOREIGN KEY ("instanceId", "projectId") REFERENCES xpert_project_pipeline_instance(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_task_link', 'pipeline_task_link_node_scope_fk', 'FOREIGN KEY ("nodeInstanceId", "projectId") REFERENCES xpert_project_pipeline_node(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_task_link', 'pipeline_task_link_task_scope_fk', 'FOREIGN KEY ("taskId", "projectId") REFERENCES xpert_project_task(id, "projectId") ON DELETE CASCADE'),
        ('xpert_project_pipeline_binding', 'pipeline_binding_values_check', 'CHECK (revision > 0)'),
        ('xpert_project_pipeline_instance', 'pipeline_instance_values_check', 'CHECK (revision >= 0 AND authority IN (''provider'',''platform'') AND ("sourceSequence" IS NULL OR ("sourceSequence" >= 0 AND "sourceSequence" <= 9007199254740991)))'),
        ('xpert_project_pipeline_run', 'pipeline_run_values_check', 'CHECK (state IN (''pending'',''active'',''waiting'',''cancelling'',''completed'',''failed'',''cancelled'',''superseded''))'),
        ('xpert_project_pipeline_round', 'pipeline_round_values_check', 'CHECK (sequence > 0 AND generation > 0 AND state IN (''active'',''completed'',''awaiting_new_subject'',''failed'',''cancelled'',''superseded''))'),
        ('xpert_project_pipeline_node', 'pipeline_node_values_check', 'CHECK (disposition IN (''active'',''removed'',''excluded'',''superseded''))'),
        ('xpert_project_pipeline_event', 'pipeline_event_values_check', 'CHECK (revision > 0)'),
        ('xpert_project_pipeline_task_link', 'pipeline_task_link_values_check', 'CHECK (relation IN (''primary'',''summary''))'),
        ('xpert_project_pipeline_refresh', 'pipeline_refresh_values_check', 'CHECK (state IN (''queued'',''running'',''ready'',''not_found'',''failed''))')
    ) AS constraints_to_apply(table_name, constraint_name, definition) LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass(item.table_name) AND conname=item.constraint_name) THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', item.table_name, item.constraint_name, item.definition);
        END IF;
    END LOOP;
END $$;

-- Freeze provider task values for round history while their logical Task identity remains stable.
ALTER TABLE xpert_project_pipeline_round ADD COLUMN IF NOT EXISTS "projectionTasks" jsonb;
COMMIT;
