SELECT 'desktop_shell_operation.completion' AS missing
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'desktop_shell_operation'
    AND column_name = 'completion' AND data_type = 'jsonb' AND is_nullable = 'YES'
);
