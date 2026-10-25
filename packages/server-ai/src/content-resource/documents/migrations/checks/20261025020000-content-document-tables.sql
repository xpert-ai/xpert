-- Verify fields and ownership constraints without reading business records.
WITH expected_columns(table_name, column_name, data_type, not_null) AS (
  VALUES
    ('content_document', 'id', 'uuid', true),
    ('content_document', 'tenantId', 'uuid', true),
    ('content_document', 'organizationId', 'uuid', true),
    ('content_document', 'createdById', 'uuid', true),
    ('content_document', 'updatedById', 'uuid', false),
    ('content_document', 'createdAt', 'timestamp with time zone', true),
    ('content_document', 'updatedAt', 'timestamp with time zone', true),
    ('content_document', 'projectId', 'uuid', true),
    ('content_document', 'path', 'text', true),
    ('content_document', 'title', 'character varying(200)', true),
    ('content_document', 'modelKey', 'character varying(160)', true),
    ('content_document', 'schemaVersion', 'integer', true),
    ('content_document', 'epoch', 'integer', true),
    ('content_document', 'collaborationId', 'uuid', false),
    ('content_document', 'headRevisionId', 'uuid', false),
    ('content_document', 'fileHash', 'character varying(64)', true),
    ('content_document', 'sequence', 'integer', true),
    ('content_document', 'status', 'character varying(16)', true),
    ('content_document', 'sourceProvider', 'character varying(160)', true),
    ('content_document', 'sourceId', 'character varying(256)', true),
    ('content_document', 'projectionPending', 'boolean', true),
    ('content_revision', 'id', 'uuid', true),
    ('content_revision', 'tenantId', 'uuid', true),
    ('content_revision', 'organizationId', 'uuid', true),
    ('content_revision', 'createdById', 'uuid', true),
    ('content_revision', 'updatedById', 'uuid', false),
    ('content_revision', 'createdAt', 'timestamp with time zone', true),
    ('content_revision', 'updatedAt', 'timestamp with time zone', true),
    ('content_revision', 'resourceId', 'uuid', true),
    ('content_revision', 'parentId', 'uuid', false),
    ('content_revision', 'mutationId', 'character varying(160)', true),
    ('content_revision', 'hash', 'character varying(64)', true),
    ('content_revision', 'stateHash', 'character varying(64)', true),
    ('content_revision', 'baseHash', 'character varying(64)', true),
    ('content_revision', 'epoch', 'integer', true),
    ('content_revision', 'sequence', 'integer', true),
    ('content_revision', 'label', 'character varying(200)', true),
    ('content_revision', 'status', 'character varying(16)', true),
    ('content_proposal', 'id', 'uuid', true),
    ('content_proposal', 'tenantId', 'uuid', true),
    ('content_proposal', 'organizationId', 'uuid', true),
    ('content_proposal', 'createdById', 'uuid', true),
    ('content_proposal', 'updatedById', 'uuid', false),
    ('content_proposal', 'createdAt', 'timestamp with time zone', true),
    ('content_proposal', 'updatedAt', 'timestamp with time zone', true),
    ('content_proposal', 'resourceId', 'uuid', true),
    ('content_proposal', 'mutationId', 'uuid', true),
    ('content_proposal', 'epoch', 'integer', true),
    ('content_proposal', 'sequence', 'integer', true),
    ('content_proposal', 'blockId', 'character varying(160)', true),
    ('content_proposal', 'before', 'text', true),
    ('content_proposal', 'after', 'text', true),
    ('content_proposal', 'status', 'character varying(16)', true),
    ('content_proposal', 'assistantId', 'uuid', false),
    ('content_proposal', 'preparedUpdate', 'text', false),
    ('content_comment', 'id', 'uuid', true),
    ('content_comment', 'tenantId', 'uuid', true),
    ('content_comment', 'organizationId', 'uuid', true),
    ('content_comment', 'createdById', 'uuid', true),
    ('content_comment', 'updatedById', 'uuid', false),
    ('content_comment', 'createdAt', 'timestamp with time zone', true),
    ('content_comment', 'updatedAt', 'timestamp with time zone', true),
    ('content_comment', 'resourceId', 'uuid', true),
    ('content_comment', 'blockId', 'character varying(160)', false),
    ('content_comment', 'epoch', 'integer', true),
    ('content_comment', 'body', 'text', true),
    ('content_comment', 'resolved', 'boolean', true),
    ('content_location_change', 'id', 'uuid', true),
    ('content_location_change', 'tenantId', 'uuid', true),
    ('content_location_change', 'organizationId', 'uuid', true),
    ('content_location_change', 'createdById', 'uuid', false),
    ('content_location_change', 'updatedById', 'uuid', false),
    ('content_location_change', 'createdAt', 'timestamp with time zone', true),
    ('content_location_change', 'updatedAt', 'timestamp with time zone', true),
    ('content_location_change', 'projectId', 'uuid', true),
    ('content_location_change', 'input', 'jsonb', true),
    ('content_location_change', 'documents', 'jsonb', true),
    ('content_location_change', 'status', 'character varying(16)', true)
), tables AS (
  SELECT DISTINCT table_name FROM expected_columns
), indexes(table_name, columns, is_unique, predicate) AS (
  VALUES
    ('content_document', ARRAY['tenantId','organizationId','projectId','path'], true, 'active'),
    ('content_revision', ARRAY['tenantId','organizationId','resourceId','mutationId'], true, 'none'),
    ('content_proposal', ARRAY['tenantId','organizationId','resourceId','mutationId'], true, 'none'),
    ('content_comment', ARRAY['tenantId','organizationId','resourceId'], false, 'none')
)
SELECT e.table_name || '.' || e.column_name AS missing
FROM expected_columns e
WHERE NOT EXISTS (
  SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass(e.table_name)
    AND a.attname = e.column_name AND a.attnum > 0 AND NOT a.attisdropped
    AND format_type(a.atttypid, a.atttypmod) = e.data_type AND a.attnotnull = e.not_null
)
UNION ALL
SELECT t.table_name || '.primary-key' FROM tables t WHERE NOT EXISTS (
  SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND c.conkey = ARRAY[a.attnum]
  WHERE c.conrelid = to_regclass(t.table_name) AND c.contype = 'p' AND a.attname = 'id'
)
UNION ALL
SELECT t.table_name || '.' || e.column_name || '-foreign-key'
FROM tables t CROSS JOIN (VALUES
  ('tenantId', 'tenant', 'c', 'a'), ('organizationId', 'organization', 'c', 'c'),
  ('createdById', '"user"', 'r', 'a'), ('updatedById', '"user"', 'r', 'a')
) AS e(column_name, target, on_delete, on_update)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND c.conkey = ARRAY[a.attnum]
  JOIN pg_attribute b ON b.attrelid = c.confrelid AND c.confkey = ARRAY[b.attnum]
  WHERE c.conrelid = to_regclass(t.table_name) AND c.contype = 'f' AND c.convalidated
    AND c.confrelid = to_regclass(e.target) AND a.attname = e.column_name AND b.attname = 'id'
    AND c.confdeltype::text = e.on_delete AND c.confupdtype::text = e.on_update
)
UNION ALL
SELECT e.table_name || '.index-' || array_to_string(e.columns, '-') FROM indexes e
WHERE NOT EXISTS (
  SELECT 1 FROM pg_index i WHERE i.indrelid = to_regclass(e.table_name) AND i.indisvalid AND i.indisready
    AND i.indisunique = e.is_unique AND ARRAY(
      SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum ORDER BY k.position
    ) = e.columns
    AND ((e.predicate = 'none' AND i.indpred IS NULL) OR
         (e.predicate = 'active' AND pg_get_expr(i.indpred, i.indrelid) = '((status)::text <> ''deleted''::text)'))
);
