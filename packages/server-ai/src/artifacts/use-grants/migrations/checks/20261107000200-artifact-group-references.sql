SELECT 'artifact_reference.' || column_name AS missing FROM (VALUES ('groupId'), ('useGrantId')) columns(column_name)
WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('artifact_reference') AND attname = column_name
 AND NOT attisdropped AND format_type(atttypid, atttypmod) = 'uuid' AND NOT attnotnull
)
UNION ALL
SELECT name FROM (VALUES
 ('IDX_artifact_reference_project', '("tenantId", "organizationId", "projectId", "artifactId") WHERE ("groupId" IS NULL)'),
 ('IDX_artifact_reference_group_grant', '("tenantId", "organizationId", "projectId", "groupId", "useGrantId") WHERE ("groupId" IS NOT NULL)')
) indexes(name, definition) WHERE NOT EXISTS (
 SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE i.indrelid = to_regclass('artifact_reference') AND c.relname = name AND i.indisvalid AND i.indisunique
 AND pg_get_indexdef(i.indexrelid) LIKE '%USING btree ' || definition
)
UNION ALL
SELECT 'artifact_reference.legacy_unique_index' WHERE to_regclass('"IDX_49f867757dc5ee09b99e1c23bc"') IS NOT NULL
UNION ALL
SELECT 'artifact_reference.group_constraint' WHERE NOT EXISTS (
 SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('artifact_reference') AND conname = 'CK_artifact_reference_group_grant'
)
UNION ALL
SELECT 'artifact_use_grant_audit.reference_events' WHERE NOT EXISTS (
 SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('artifact_use_grant_audit') AND conname = 'artifact_use_grant_audit_event_check'
 AND pg_get_constraintdef(oid) LIKE '%reference_attached%' AND pg_get_constraintdef(oid) LIKE '%reference_removed%'
);
