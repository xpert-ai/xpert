-- Middleware Apps do not have a Toolset. Preserve their provider identity for audit.
-- Apply before enabling middleware Apps when TypeORM synchronization is disabled.
BEGIN;
ALTER TABLE "mcp_app_audit" ALTER COLUMN "toolsetId" DROP NOT NULL;
ALTER TABLE "mcp_app_audit" ADD COLUMN IF NOT EXISTS "source" json;
COMMIT;
