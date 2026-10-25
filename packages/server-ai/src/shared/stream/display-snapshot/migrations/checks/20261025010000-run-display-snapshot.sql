WITH columns(name) AS (
  VALUES ('threadId'), ('runId'), ('tenantId'), ('organizationId'), ('segmentId'),
         ('revision'), ('cursor'), ('snapshot'), ('savedAt')
), missing_columns AS (
  SELECT 'chat_run_display_snapshot.' || name AS missing FROM columns
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('chat_run_display_snapshot')
      AND attname = columns.name AND attnum > 0 AND NOT attisdropped
  )
)
SELECT missing FROM missing_columns
UNION ALL
SELECT 'chat_run_display_snapshot.primary-key' WHERE NOT EXISTS (
  SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('chat_run_display_snapshot')
    AND c.contype = 'p' AND ARRAY(
      SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, position)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.position
    ) = ARRAY['threadId', 'runId']
)
UNION ALL
SELECT 'chat_run_display_snapshot.' || expected.column_name || '-cascade'
FROM (VALUES ('threadId', 'chat_conversation_thread', 'threadId'),
             ('runId', 'xpert_agent_execution', 'id')) AS expected(column_name, target, target_column)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND c.conkey = ARRAY[a.attnum]
  JOIN pg_attribute b ON b.attrelid = c.confrelid AND c.confkey = ARRAY[b.attnum]
  WHERE c.conrelid = to_regclass('chat_run_display_snapshot') AND c.contype = 'f'
    AND c.confrelid = to_regclass(expected.target) AND c.confdeltype = 'c' AND c.convalidated
    AND a.attname = expected.column_name AND b.attname = expected.target_column
);
