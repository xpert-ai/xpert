SELECT 'artifact_use_grant.analysis' AS missing WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('artifact_use_grant') AND attname = 'analysis'
 AND NOT attisdropped AND format_type(atttypid, atttypmod) = 'jsonb' AND NOT attnotnull
)
UNION ALL
SELECT 'resource_analysis_execution.' || name FROM (VALUES
 ('id', 'uuid'), ('tenantId', 'uuid'), ('organizationId', 'uuid'), ('grantId', 'uuid'),
 ('referenceId', 'uuid'), ('groupId', 'uuid'), ('actorId', 'uuid'), ('assistantId', 'uuid'),
 ('executionId', 'uuid'), ('grantRevision', 'integer'), ('datasetKey', 'character varying(128)'),
 ('queryHash', 'character varying(64)'), ('status', 'character varying'), ('createdAt', 'timestamp with time zone')
) columns(name, type) WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('resource_analysis_execution') AND attname = name
 AND NOT attisdropped AND format_type(atttypid, atttypmod) = type AND attnotnull
)
UNION ALL
SELECT 'resource_analysis_execution.primary_key' WHERE NOT EXISTS (
 SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('resource_analysis_execution') AND contype = 'p'
 AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
)
UNION ALL
SELECT 'resource_analysis_execution.grant_fk' WHERE NOT EXISTS (
 SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('resource_analysis_execution') AND contype = 'f'
 AND convalidated AND confrelid = to_regclass('artifact_use_grant')
 AND pg_get_constraintdef(oid) = 'FOREIGN KEY ("grantId") REFERENCES artifact_use_grant(id)'
)
UNION ALL
SELECT 'resource_analysis_execution.status' WHERE NOT EXISTS (
 SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('resource_analysis_execution') AND contype = 'c'
 AND convalidated AND pg_get_constraintdef(oid) LIKE '%running%' AND pg_get_constraintdef(oid) LIKE '%succeeded%'
 AND pg_get_constraintdef(oid) LIKE '%denied%'
)
UNION ALL
SELECT 'resource_analysis_execution.scope_index' WHERE NOT EXISTS (
 SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE i.indrelid = to_regclass('resource_analysis_execution') AND c.relname = 'IDX_resource_analysis_execution_scope'
 AND i.indisvalid AND pg_get_indexdef(i.indexrelid) LIKE '%USING btree ("tenantId", "organizationId", "groupId", "executionId")'
);
