-- Apply before history/resume when TypeORM synchronization is disabled.
-- Initial provenance expires with the conversation or execution, independently of Redis leases.
BEGIN;
CREATE TABLE IF NOT EXISTS "mcp_app_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "createdById" uuid REFERENCES "user"("id") ON DELETE RESTRICT,
    "updatedById" uuid REFERENCES "user"("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "tenantId" uuid REFERENCES "tenant"("id") ON DELETE CASCADE,
    "organizationId" uuid REFERENCES "organization"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "conversationId" uuid NOT NULL,
    "executionId" uuid NOT NULL,
    "snapshot" jsonb NOT NULL,
    CONSTRAINT "FK_mcp_app_history_conversation" FOREIGN KEY ("conversationId")
        REFERENCES "chat_conversation"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_mcp_app_history_execution" FOREIGN KEY ("executionId")
        REFERENCES "xpert_agent_execution"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "IDX_mcp_app_history_conversation"
    ON "mcp_app_history" ("tenantId", "organizationId", "conversationId");
CREATE INDEX IF NOT EXISTS "IDX_mcp_app_history_execution" ON "mcp_app_history" ("executionId");
CREATE INDEX IF NOT EXISTS "IDX_mcp_app_history_tenant" ON "mcp_app_history" ("tenantId");
CREATE INDEX IF NOT EXISTS "IDX_mcp_app_history_organization" ON "mcp_app_history" ("organizationId");
COMMIT;
