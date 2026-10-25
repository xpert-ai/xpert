/* xpert-migration
{
  "dependsOn": ["core.platform.20261020000400-platform-constraints-b"],
  "mode": "transactional",
  "phase": "after-sync"
}
*/
-- Register the recovery column with the managed-schema runner. The historical
-- eight-digit manual SQL file is not a discoverable migration in that runner.
ALTER TABLE chat_conversation ADD COLUMN IF NOT EXISTS "workingThreadRevision" integer NOT NULL DEFAULT 0;
