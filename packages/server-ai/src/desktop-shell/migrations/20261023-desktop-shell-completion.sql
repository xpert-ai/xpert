-- An old terminal state cannot be upgraded to owned-descendant evidence during migration.
ALTER TABLE desktop_shell_operation ADD COLUMN IF NOT EXISTS completion jsonb NULL;
