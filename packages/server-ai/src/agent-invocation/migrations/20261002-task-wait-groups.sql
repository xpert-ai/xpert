-- Apply after 20261001-invocation-wait.sql, before starting the upgraded host.
-- Old single-invocation rows remain readable; new groups have their own identity.
BEGIN;
ALTER TABLE agent_invocation_wait DROP CONSTRAINT IF EXISTS agent_invocation_wait_id_fkey;
ALTER TABLE agent_invocation_wait DROP CONSTRAINT IF EXISTS agent_invocation_wait_state_check;
ALTER TABLE agent_invocation_wait ADD CONSTRAINT agent_invocation_wait_state_check
  CHECK (state IN ('waiting','ready','delivered','stale','blocked'));
ALTER TABLE agent_invocation_wait ADD COLUMN IF NOT EXISTS request jsonb;
ALTER TABLE agent_invocation_wait ADD COLUMN IF NOT EXISTS outcome varchar;
ALTER TABLE agent_invocation_wait ADD COLUMN IF NOT EXISTS "deadlineAt" timestamptz;
ALTER TABLE agent_invocation_wait ADD COLUMN IF NOT EXISTS "unknownSince" timestamptz;
UPDATE agent_invocation_wait SET "deadlineAt" = now() + interval '24 hours' WHERE "deadlineAt" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_agent_invocation_wait_tasks" ON agent_invocation_wait USING gin ((request->'taskIds'));
COMMIT;
