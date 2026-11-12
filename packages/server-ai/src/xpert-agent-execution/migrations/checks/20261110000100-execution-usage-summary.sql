SELECT 'xpert_agent_execution.usageSummary' AS missing WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('xpert_agent_execution')
      AND attname = 'usageSummary' AND NOT attisdropped AND NOT attnotnull AND format_type(atttypid, atttypmod) = 'jsonb'
);
