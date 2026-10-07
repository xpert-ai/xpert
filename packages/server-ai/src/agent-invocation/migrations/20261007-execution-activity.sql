-- Public activity is retained independently of guest lifetime. No existing execution is replayed.
BEGIN;
CREATE TABLE IF NOT EXISTS agent_invocation_activity_state (
 id uuid PRIMARY KEY REFERENCES agent_invocation(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 "createdById" uuid, "updatedById" uuid,
 seq int NOT NULL DEFAULT 0, bytes int NOT NULL DEFAULT 0, "sourceCursor" varchar, closed boolean NOT NULL DEFAULT false, gaps jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS agent_invocation_activity_item (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 "createdById" uuid, "updatedById" uuid,
 "invocationId" uuid NOT NULL REFERENCES agent_invocation(id) ON DELETE CASCADE,
 seq int NOT NULL, "firstSeq" int NOT NULL, "itemId" varchar NOT NULL, hash varchar NOT NULL, item jsonb NOT NULL,
 UNIQUE ("invocationId", seq)
);
CREATE INDEX IF NOT EXISTS "IDX_invocation_activity_item" ON agent_invocation_activity_item ("invocationId", "itemId", seq DESC);
ALTER TABLE agent_invocation_activity_state ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz;
ALTER TABLE agent_invocation_activity_state ADD COLUMN IF NOT EXISTS expired boolean NOT NULL DEFAULT false;
UPDATE agent_invocation_activity_state SET "expiresAt" = "updatedAt" + interval '30 days' WHERE closed AND "expiresAt" IS NULL;
COMMIT;
