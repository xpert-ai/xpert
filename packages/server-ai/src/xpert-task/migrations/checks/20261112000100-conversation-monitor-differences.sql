SELECT 'xpert_task_execution.differenceKeys' AS missing WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'xpert_task_execution'
    AND column_name = 'differenceKeys' AND udt_name = '_text');
