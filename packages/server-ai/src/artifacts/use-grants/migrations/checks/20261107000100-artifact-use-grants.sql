WITH expected(table_name, column_name, data_type, not_null) AS (
 VALUES
 ('artifact_use_grant', 'id', 'uuid', true),
 ('artifact_use_grant', 'tenantId', 'uuid', true),
 ('artifact_use_grant', 'organizationId', 'uuid', true),
 ('artifact_use_grant', 'artifactId', 'uuid', true),
 ('artifact_use_grant', 'versionId', 'uuid', true),
 ('artifact_use_grant', 'ownerProjectId', 'uuid', true),
 ('artifact_use_grant', 'targetProjectId', 'uuid', true),
 ('artifact_use_grant', 'targetGroupId', 'uuid', true),
 ('artifact_use_grant', 'permission', 'character varying', true),
 ('artifact_use_grant', 'status', 'character varying', true),
 ('artifact_use_grant', 'revision', 'integer', true),
 ('artifact_use_grant', 'issuedById', 'uuid', true),
 ('artifact_use_grant', 'acceptedById', 'uuid', false),
 ('artifact_use_grant', 'acceptedAt', 'timestamp with time zone', false),
 ('artifact_use_grant', 'closedById', 'uuid', false),
 ('artifact_use_grant', 'closedAt', 'timestamp with time zone', false),
 ('artifact_use_grant', 'expiresAt', 'timestamp with time zone', true),
 ('artifact_use_grant_audit', 'id', 'uuid', true),
 ('artifact_use_grant_audit', 'tenantId', 'uuid', true),
 ('artifact_use_grant_audit', 'organizationId', 'uuid', true),
 ('artifact_use_grant_audit', 'grantId', 'uuid', true),
 ('artifact_use_grant_audit', 'actorId', 'uuid', true),
 ('artifact_use_grant_audit', 'event', 'character varying', true),
 ('artifact_use_grant_audit', 'revision', 'integer', true)
)
SELECT e.table_name || '.' || e.column_name AS missing
FROM expected e WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass(e.table_name)
 AND a.attname = e.column_name AND NOT a.attisdropped
 AND format_type(a.atttypid, a.atttypmod) = e.data_type AND a.attnotnull = e.not_null
)
UNION ALL
SELECT name FROM (VALUES
 ('artifact_use_grant', 'IDX_artifact_use_grant_target', '("tenantId", "organizationId", "targetGroupId", "targetProjectId")'),
 ('artifact_use_grant', 'IDX_artifact_use_grant_source', '("tenantId", "organizationId", "artifactId")'),
 ('artifact_use_grant_audit', 'IDX_artifact_use_grant_audit_scope', '("tenantId", "organizationId", "grantId", "createdAt")')
) indexes(table_name, name, columns) WHERE NOT EXISTS (
 SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE i.indrelid = to_regclass(table_name) AND c.relname = name AND i.indisvalid
 AND pg_get_indexdef(i.indexrelid) LIKE '%USING btree ' || columns
)
UNION ALL
SELECT table_name || '.primary_key' FROM (VALUES ('artifact_use_grant'), ('artifact_use_grant_audit')) tables(table_name)
WHERE NOT EXISTS (
 SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass(table_name)
 AND contype = 'p' AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
)
UNION ALL
SELECT name FROM (VALUES ('CK_artifact_use_grant_projects'), ('CK_artifact_use_grant_lifecycle')) constraints(name)
WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('artifact_use_grant') AND conname = name);
