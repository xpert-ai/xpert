ALTER TABLE agent_output_delivery
  ADD COLUMN IF NOT EXISTS "decisionIntegrationId" uuid,
  ADD COLUMN IF NOT EXISTS "decisionAppId" varchar,
  ADD COLUMN IF NOT EXISTS "decisionChatDigest" varchar,
  ADD COLUMN IF NOT EXISTS "decisionRoute" jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_output_decision_message ON agent_output_delivery
  ("tenantId","organizationId","decisionIntegrationId","decisionAppId","providerMessageId")
  WHERE "decisionIntegrationId" IS NOT NULL;
