-- Estimates are informational. Existing actual usage and reservations are unchanged.
BEGIN;
ALTER TABLE model_gateway_call ADD COLUMN IF NOT EXISTS "estimatedUsage" jsonb;
CREATE TABLE IF NOT EXISTS model_execution_reconciliation (
  id uuid PRIMARY KEY,
  "tenantId" uuid NOT NULL REFERENCES tenant(id), "organizationId" uuid NOT NULL REFERENCES organization(id),
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "callId" uuid NOT NULL REFERENCES model_gateway_call(id), "reviewerId" uuid NOT NULL REFERENCES "user"(id),
  evidence jsonb NOT NULL, "appliedAt" timestamptz,
  UNIQUE ("tenantId", "callId")
);
COMMIT;
