-- Deploy after project-task-runtime.sql and before enabling reliable reply workers. Safe to apply twice.
BEGIN;
ALTER TABLE agent_invocation
    ADD COLUMN IF NOT EXISTS "nextObservationAt" timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS "observationLeaseToken" uuid,
    ADD COLUMN IF NOT EXISTS "observationLeaseUntil" timestamptz,
    ADD COLUMN IF NOT EXISTS "observationError" varchar;
CREATE INDEX IF NOT EXISTS "IDX_invocation_observation_due" ON agent_invocation ("nextObservationAt");
ALTER TABLE chat_conversation_thread ADD COLUMN IF NOT EXISTS "runtimeContinuationBlockedAt" timestamptz;
ALTER TABLE xpert_project_task_execution
    ADD COLUMN IF NOT EXISTS "projectedTaskRevision" int,
    ADD COLUMN IF NOT EXISTS "projectedInvocationRevision" int NOT NULL DEFAULT -1,
    ADD COLUMN IF NOT EXISTS "dispatchNextAttemptAt" timestamptz,
    ADD COLUMN IF NOT EXISTS "dispatchError" varchar;
-- Existing pending intents may recover, but old task decisions have no projection fence and stay untouched.
UPDATE xpert_project_task_execution SET "dispatchNextAttemptAt" = now()
WHERE "dispatchState" = 'pending' AND "dispatchNextAttemptAt" IS NULL AND "dispatchError" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_task_dispatch_due" ON xpert_project_task_execution ("dispatchState", "dispatchNextAttemptAt");
CREATE TABLE IF NOT EXISTS agent_runtime_delivery (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE, "createdById" uuid, "updatedById" uuid,
    "messageId" varchar NOT NULL UNIQUE, "invocationId" uuid NOT NULL REFERENCES agent_invocation(id) ON DELETE CASCADE, "ownerId" varchar NOT NULL,
    event jsonb NOT NULL, state varchar NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0,
    "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "leaseToken" uuid, "leaseUntil" timestamptz, "lastError" varchar
);
CREATE INDEX IF NOT EXISTS "IDX_runtime_delivery_due" ON agent_runtime_delivery (state, "nextAttemptAt");
CREATE TABLE IF NOT EXISTS agent_runtime_inbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE, "createdById" uuid, "updatedById" uuid,
    "consumptionKey" varchar NOT NULL, "messageId" varchar NOT NULL, "invocationId" uuid NOT NULL REFERENCES agent_invocation(id) ON DELETE CASCADE, "ownerId" varchar NOT NULL,
    event jsonb NOT NULL, state varchar NOT NULL DEFAULT 'pending', claim jsonb, phase varchar,
    "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "leaseToken" uuid, "leaseUntil" timestamptz, "lastError" varchar, attempts int NOT NULL DEFAULT 0,
    UNIQUE ("tenantId", "organizationId", "ownerId", "consumptionKey")
);
CREATE INDEX IF NOT EXISTS "IDX_runtime_inbox_due" ON agent_runtime_inbox (state, "nextAttemptAt");
COMMIT;
