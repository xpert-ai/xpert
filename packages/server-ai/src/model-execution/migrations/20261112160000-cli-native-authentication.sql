-- Existing sessions and Shell children remain platform-managed when these nullable fields are absent.
ALTER TABLE cli_session ADD COLUMN IF NOT EXISTS "nativeLeaseId" uuid;
ALTER TABLE cli_session ADD COLUMN IF NOT EXISTS connection jsonb;
ALTER TABLE shell_cli_execution ADD COLUMN IF NOT EXISTS "nativeLeaseId" uuid;
