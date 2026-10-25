/* xpert-migration
{
  "dependsOn": ["core.platform.20261020000400-platform-constraints-b"],
  "mode": "transactional",
  "phase": "after-sync"
}
*/
-- Preserve old operations: NULL is deliberately not proof of actual completion.
ALTER TABLE desktop_shell_operation ADD COLUMN IF NOT EXISTS completion jsonb NULL;
