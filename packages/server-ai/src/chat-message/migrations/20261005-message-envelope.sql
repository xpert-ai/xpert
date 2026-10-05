-- Apply before deploying host message provenance and presentation support.
BEGIN;
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS "messageEnvelope" jsonb;
COMMIT;
