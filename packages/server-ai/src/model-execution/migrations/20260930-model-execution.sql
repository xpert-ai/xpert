-- Additive migration. Roll back by disabling admission, not by deleting consumption history.
BEGIN;
CREATE TABLE IF NOT EXISTS model_execution_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id), "organizationId" uuid NOT NULL REFERENCES organization(id),
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ownerId" uuid NOT NULL REFERENCES "user"(id), "credentialHash" varchar NOT NULL UNIQUE,
  status varchar NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  context jsonb NOT NULL, models jsonb NOT NULL, "defaultModelId" varchar NOT NULL,
  limits jsonb NOT NULL, "expiresAt" timestamptz NOT NULL, "absoluteExpiresAt" timestamptz NOT NULL,
  CHECK ("expiresAt" <= "absoluteExpiresAt")
);
CREATE INDEX IF NOT EXISTS "IDX_model_execution_grant_owner" ON model_execution_grant ("tenantId","organizationId","ownerId");
CREATE TABLE IF NOT EXISTS cli_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id), "organizationId" uuid NOT NULL REFERENCES organization(id),
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ownerId" uuid NOT NULL REFERENCES "user"(id), "conversationId" uuid NOT NULL REFERENCES chat_conversation(id),
  "xpertId" uuid NOT NULL REFERENCES xpert(id), "grantId" uuid REFERENCES model_execution_grant(id),
  tool jsonb NOT NULL, "workingDirectory" varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'starting' CHECK (status IN ('starting','running','stopping','exited','unknown')),
  runner jsonb, "exitCode" integer, "endedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "IDX_cli_session_owner" ON cli_session ("tenantId","organizationId","ownerId","conversationId");
ALTER TABLE model_gateway_call ADD COLUMN IF NOT EXISTS source varchar NOT NULL DEFAULT 'external_api';
ALTER TABLE model_gateway_call ADD COLUMN IF NOT EXISTS "grantId" uuid REFERENCES model_execution_grant(id);
ALTER TABLE model_gateway_call ADD COLUMN IF NOT EXISTS "callId" uuid;
ALTER TABLE model_gateway_call ADD COLUMN IF NOT EXISTS "reservedTokens" integer NOT NULL DEFAULT 0 CHECK ("reservedTokens" >= 0);
ALTER TABLE model_gateway_call ADD COLUMN IF NOT EXISTS "usageFact" jsonb;
ALTER TABLE model_gateway_call ADD COLUMN IF NOT EXISTS "estimatedUsage" jsonb;
ALTER TABLE model_gateway_call ADD COLUMN IF NOT EXISTS "usageDeliveredAt" timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
    AND table_name = 'model_gateway_call' AND column_name = 'dispatchedAt') THEN
    ALTER TABLE model_gateway_call ADD COLUMN "dispatchedAt" timestamptz;
    -- Existing attempts may have reached a provider; never release those reservations speculatively.
    UPDATE model_gateway_call SET "dispatchedAt" = "startedAt" WHERE source = 'execution_grant';
  END IF;
END $$;
ALTER TABLE model_gateway_call ALTER COLUMN "apiKeyId" DROP NOT NULL;
ALTER TABLE model_gateway_call ALTER COLUMN "publicationId" DROP NOT NULL;
ALTER TABLE model_gateway_call DROP CONSTRAINT IF EXISTS "CHK_model_gateway_call_source";
ALTER TABLE model_gateway_call ADD CONSTRAINT "CHK_model_gateway_call_source" CHECK (
  (source = 'external_api' AND "apiKeyId" IS NOT NULL AND "publicationId" IS NOT NULL AND "grantId" IS NULL) OR
  (source = 'execution_grant' AND "apiKeyId" IS NULL AND "publicationId" IS NULL AND "grantId" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "IDX_model_gateway_call_grant" ON model_gateway_call ("grantId", "startedAt");
CREATE INDEX IF NOT EXISTS "IDX_model_gateway_call_user_started" ON model_gateway_call ("tenantId", "userId", "startedAt", status);
ALTER TABLE membership_point_ledger ADD COLUMN IF NOT EXISTS "executionContext" jsonb;
ALTER TABLE membership_point_ledger ADD COLUMN IF NOT EXISTS "tokenDetails" jsonb;
COMMIT;
