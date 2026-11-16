SELECT expected.table_name || '.' || expected.column_name AS missing
FROM (VALUES ('cli_session', 'nativeLeaseId', 'uuid'), ('cli_session', 'connection', 'jsonb'),
             ('shell_cli_execution', 'nativeLeaseId', 'uuid')) AS expected(table_name, column_name, data_type)
WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns actual
    WHERE actual.table_schema = current_schema() AND actual.table_name = expected.table_name
      AND actual.column_name = expected.column_name AND actual.data_type = expected.data_type
      AND actual.is_nullable = 'YES'
);
