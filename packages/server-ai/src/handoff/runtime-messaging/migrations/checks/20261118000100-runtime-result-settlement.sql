SELECT required.index_name AS missing
FROM (VALUES
    ('agent_runtime_delivery', 'IDX_runtime_delivery_result_scope'),
    ('agent_runtime_inbox', 'IDX_runtime_inbox_result_scope')
) AS required(table_name, index_name)
WHERE to_regclass(required.table_name) IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = required.table_name
      AND indexname = required.index_name
);
