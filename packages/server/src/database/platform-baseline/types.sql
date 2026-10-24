SELECT 'extension:' || required.name AS missing
FROM (VALUES ('pgcrypto'), ('vector')) AS required(name)
WHERE NOT EXISTS (SELECT 1 FROM pg_extension e WHERE e.extname=required.name)
UNION ALL
SELECT 'enum:' || required.name
FROM (VALUES
('xpert_project_task_execution_status_enum', ARRAY['queued', 'running', 'succeeded', 'failed', 'cancelled']::text[]),
('xpert_project_task_priority_enum', ARRAY['urgent', 'high', 'medium', 'low']::text[]),
('xpert_project_task_status_enum', ARRAY['todo', 'in_progress', 'review', 'paused', 'done', 'blocked', 'cancelled', 'pending', 'completed', 'failed']::text[])
) AS required(name, labels)
WHERE NOT EXISTS (
 SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname=current_schema() AND t.typname=required.name
 AND (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)=required.labels
);
