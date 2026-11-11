SELECT 'xpert_project_task.reviewSubject' AS missing WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('xpert_project_task')
 AND attname = 'reviewSubject' AND NOT attisdropped AND format_type(atttypid, atttypmod) = 'jsonb' AND NOT attnotnull
);
