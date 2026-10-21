SELECT 'analytics_definition' AS missing WHERE to_regclass('analytics_definition') IS NULL
UNION ALL SELECT 'analytics_definition_version' WHERE to_regclass('analytics_definition_version') IS NULL
UNION ALL SELECT 'analytics_version_unique' WHERE NOT EXISTS (
  SELECT 1 FROM pg_indexes WHERE tablename = 'analytics_definition_version' AND indexname = 'IDX_analytics_definition_version_number' AND indexdef LIKE 'CREATE UNIQUE INDEX%'
);
