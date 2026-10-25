-- Apply before starting a host with resource-governed Knowledge libraries.
-- Existing libraries remain unbound and retain their established ACL.
ALTER TABLE "knowledgebase" ADD COLUMN IF NOT EXISTS "resourceRef" jsonb NULL;
