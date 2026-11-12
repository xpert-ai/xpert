WITH expected(column_name, data_type, not_null) AS (
 VALUES ('projectId', 'uuid', false), ('tenantId', 'uuid', false), ('organizationId', 'uuid', false),
 ('values', 'jsonb', true), ('revision', 'integer', true)
)
SELECT 'xpert_project_configuration.' || e.column_name AS missing FROM expected e WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('xpert_project_configuration')
 AND a.attname = e.column_name AND NOT a.attisdropped
 AND format_type(a.atttypid, a.atttypmod) = e.data_type AND a.attnotnull = e.not_null
)
UNION ALL
SELECT 'IDX_project_configuration_project' WHERE NOT EXISTS (
 SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"IDX_project_configuration_project"')
 AND indrelid = to_regclass('xpert_project_configuration') AND indisunique AND indisvalid
);
