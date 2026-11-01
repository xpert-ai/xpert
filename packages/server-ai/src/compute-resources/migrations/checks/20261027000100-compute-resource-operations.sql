-- Return identifiers only; never inspect management reasons or business data.
WITH expected(column_name, data_type, not_null) AS (
 VALUES ('id', 'uuid', true), ('tenantId', 'uuid', true), ('organizationId', 'uuid', false),
 ('resourceId', 'uuid', true), ('resourceName', 'character varying(100)', true),
 ('containerId', 'character varying(128)', true), ('actorId', 'uuid', true),
 ('reason', 'character varying(500)', true), ('status', 'character varying(20)', true),
 ('createdAt', 'timestamp with time zone', true), ('completedAt', 'timestamp with time zone', false)
)
SELECT 'compute_resource_operation.' || e.column_name AS missing
FROM expected e
WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute a
 WHERE a.attrelid = to_regclass('compute_resource_operation') AND a.attname = e.column_name
 AND NOT a.attisdropped AND format_type(a.atttypid, a.atttypmod) = e.data_type AND a.attnotnull = e.not_null
)
UNION ALL
SELECT 'compute_resource_operation.primary_key' WHERE NOT EXISTS (
 SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('compute_resource_operation')
 AND contype = 'p' AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
)
UNION ALL
SELECT 'compute_resource_operation.scope_index' WHERE NOT EXISTS (
 SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE i.indrelid = to_regclass('compute_resource_operation') AND c.relname = 'IDX_compute_resource_operation_scope'
 AND i.indisvalid AND pg_get_indexdef(i.indexrelid) LIKE '%USING btree ("tenantId", "organizationId", "resourceId", "createdAt")'
);
