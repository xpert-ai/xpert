BEGIN;
CREATE TABLE IF NOT EXISTS agent_invocation_wait (
  id uuid PRIMARY KEY REFERENCES agent_invocation(id) ON DELETE CASCADE,
  "tenantId" uuid NOT NULL REFERENCES tenant(id), "organizationId" uuid NOT NULL REFERENCES organization(id),
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ownerId" varchar NOT NULL, "threadId" varchar NOT NULL, "checkpointNamespace" varchar NOT NULL,
  state varchar NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting','delivered','stale')),
  "nextCheckAt" timestamptz NOT NULL DEFAULT now(), "leaseToken" uuid, "leaseUntil" timestamptz, "lastError" varchar
);
CREATE INDEX IF NOT EXISTS "IDX_agent_invocation_wait_due" ON agent_invocation_wait (state, "nextCheckAt");
COMMIT;
