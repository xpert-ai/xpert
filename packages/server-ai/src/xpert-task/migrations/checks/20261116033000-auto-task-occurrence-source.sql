SELECT 'xpert_task_execution.taskSource' AS missing WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'xpert_task_execution'
      AND column_name = 'taskSource' AND data_type = 'character varying'
      AND character_maximum_length = 16 AND is_nullable = 'NO'
      AND column_default = '''xpert_task''::character varying'
);
