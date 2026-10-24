/* xpert-migration
{"dependsOn":["core.platform.20261020000400-platform-constraints-b"],"phase":"after-sync"}
*/
-- Required before deploying delayed message-edit admission. Existing branches and histories are unchanged.
ALTER TABLE chat_conversation ADD COLUMN IF NOT EXISTS "workingThreadRevision" integer NOT NULL DEFAULT 0;
