SELECT 'execution_task_publication.diagnostic' AS missing
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'execution_task_publication'
    AND column_name = 'diagnostic' AND data_type = 'jsonb'
);
