-- Deploy before enabling conversation branching. Existing messages stay unanchored.
BEGIN;
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS "outputCheckpoint" jsonb;
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS "historicalAgentRuns" jsonb;
ALTER TABLE chat_conversation ADD COLUMN IF NOT EXISTS "branchSource" jsonb;
CREATE INDEX IF NOT EXISTS "IDX_chat_conversation_branch_request"
  ON chat_conversation ("createdById", ("branchSource" ->> 'threadId'), ("branchSource" ->> 'requestId'))
  WHERE "branchSource" IS NOT NULL;
COMMIT;
