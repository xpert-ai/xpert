-- Wall-clock completion is independent of elapsed execution time and metadata updates.
-- Existing rows remain unknown: neither elapsedTime nor updatedAt proves their end time.
ALTER TABLE xpert_agent_execution
  ADD COLUMN IF NOT EXISTS "completedAt" timestamp with time zone;
