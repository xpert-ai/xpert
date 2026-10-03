-- Additive. Disable new shell admission before rollback; preserve grants and all usage history.
BEGIN;
ALTER TABLE model_execution_grant DROP CONSTRAINT IF EXISTS model_execution_grant_status_check;
ALTER TABLE model_execution_grant ADD CONSTRAINT model_execution_grant_status_check CHECK (status IN ('pending','active','revoked'));
CREATE TABLE IF NOT EXISTS shell_process_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id), "organizationId" uuid NOT NULL REFERENCES organization(id),
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ownerId" uuid NOT NULL REFERENCES "user"(id), "parentExecutionId" uuid NOT NULL REFERENCES xpert_agent_execution(id),
  "toolCallId" varchar NOT NULL, "commandHash" varchar NOT NULL, generation integer NOT NULL DEFAULT 1,
  "maintenanceFence" integer NOT NULL DEFAULT 0, binding jsonb NOT NULL, runner jsonb, status varchar NOT NULL DEFAULT 'preparing',
  deadline timestamptz NOT NULL, "observedAt" timestamptz, "exitCode" integer,
  CHECK (generation > 0),
  CHECK (status IN ('preparing','prepared','starting','running','exited','failed','stopped','unknown')),
  UNIQUE ("tenantId", "parentExecutionId", "toolCallId")
);
CREATE TABLE IF NOT EXISTS shell_cli_execution (
  id uuid PRIMARY KEY,
  "tenantId" uuid NOT NULL REFERENCES tenant(id), "organizationId" uuid NOT NULL REFERENCES organization(id),
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ownerId" uuid NOT NULL REFERENCES "user"(id), "shellExecutionId" uuid NOT NULL REFERENCES shell_process_execution(id),
  generation integer NOT NULL, tool jsonb NOT NULL, "profileRevision" varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'preparing', "grantId" uuid REFERENCES model_execution_grant(id), "exitCode" integer,
  CHECK (generation > 0), CHECK (status IN ('preparing','prepared','starting','running','exited','failed','stopped','unknown'))
);
CREATE INDEX IF NOT EXISTS "IDX_shell_cli_execution_parent" ON shell_cli_execution ("tenantId", "shellExecutionId");
CREATE INDEX IF NOT EXISTS "IDX_model_execution_parent" ON model_execution_grant
  ("tenantId", "ownerId", (context->'source'->>'parentExecutionId')) WHERE context->'source'->>'type'='shell_execution';
COMMIT;
