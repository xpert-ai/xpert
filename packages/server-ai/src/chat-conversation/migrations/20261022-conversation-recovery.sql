-- Required before deploying delayed message-edit admission. Existing branches and histories are unchanged.
ALTER TABLE chat_conversation ADD COLUMN IF NOT EXISTS "workingThreadRevision" integer NOT NULL DEFAULT 0;
