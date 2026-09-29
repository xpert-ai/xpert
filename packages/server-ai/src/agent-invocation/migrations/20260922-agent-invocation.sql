-- Apply before deploying the unified Agent invocation runtime. No existing data is changed.
BEGIN;
CREATE TABLE IF NOT EXISTS agent_invocation (
  id uuid PRIMARY KEY,
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ownerId" varchar NOT NULL, revision integer NOT NULL DEFAULT 0,
  invocation jsonb NOT NULL, "providerSource" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_agent_invocation_scope" ON agent_invocation ("tenantId", "organizationId", "ownerId");
CREATE TABLE IF NOT EXISTS agent_runtime_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  title varchar NOT NULL, "workspaceIds" jsonb NOT NULL,
  target jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS agent_invocation_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "invocationId" uuid NOT NULL REFERENCES agent_invocation(id) ON DELETE CASCADE,
  "ownerId" varchar NOT NULL, revision integer NOT NULL, observation jsonb NOT NULL,
  UNIQUE ("invocationId", revision)
);
COMMIT;
