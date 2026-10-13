-- Existing operations acquire their first lock before their next import/write. No resource is auto-installed.
ALTER TABLE template_installation ADD COLUMN IF NOT EXISTS "dependencyLocks" jsonb;
