SELECT 'chat_conversation.workingThreadRevision' AS missing
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'chat_conversation'
    AND column_name = 'workingThreadRevision' AND data_type = 'integer'
    AND is_nullable = 'NO' AND column_default = '0'
);
