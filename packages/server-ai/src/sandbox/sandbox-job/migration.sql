-- Apply before enabling controlled Sandbox Jobs; legacy work has no trustworthy exit receipt.
ALTER TABLE sandbox_job ADD COLUMN IF NOT EXISTS generation uuid;
ALTER TABLE sandbox_job ADD COLUMN IF NOT EXISTS "inputHash" varchar;
ALTER TABLE sandbox_job ADD COLUMN IF NOT EXISTS control jsonb;
ALTER TABLE sandbox_job ADD COLUMN IF NOT EXISTS "capacityHeld" boolean NOT NULL DEFAULT false;
ALTER TABLE sandbox_job ADD COLUMN IF NOT EXISTS "nextControlAt" timestamptz;
CREATE INDEX IF NOT EXISTS sandbox_job_control_due ON sandbox_job ("nextControlAt") WHERE "nextControlAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS sandbox_job_capacity_held ON sandbox_job ("tenantId", "userId") WHERE "capacityHeld";
UPDATE sandbox_job SET status = 'unknown', "finishedAt" = NULL, "capacityHeld" = true
WHERE control IS NULL AND (status IN ('waiting', 'starting', 'running', 'lost') OR "cleanupPending");
