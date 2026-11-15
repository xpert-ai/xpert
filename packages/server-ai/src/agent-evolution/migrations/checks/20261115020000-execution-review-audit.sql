SELECT 'execution_review.' || expected.name AS missing
FROM (VALUES ('createdAt', 'timestamptz', true), ('updatedAt', 'timestamptz', true),
             ('createdById', 'uuid', false), ('updatedById', 'uuid', false)) AS expected(name, type_name, required)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = to_regclass('agent_evolution_execution_review') AND a.attname = expected.name
      AND a.atttypid = to_regtype(expected.type_name) AND a.attnotnull = expected.required AND NOT a.attisdropped
      AND (NOT expected.required OR a.atthasdef)
)
UNION ALL
SELECT 'execution_review.foreign_key.' || expected.column_name
FROM (VALUES ('createdById', '"user"', 'r', 'a'), ('updatedById', '"user"', 'r', 'a'),
             ('tenantId', 'tenant', 'c', 'a'), ('organizationId', 'organization', 'c', 'c'))
    AS expected(column_name, parent, on_delete, on_update)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND c.conkey = ARRAY[a.attnum]
    WHERE c.conrelid = to_regclass('agent_evolution_execution_review') AND c.contype = 'f' AND c.convalidated
      AND a.attname = expected.column_name AND c.confrelid = to_regclass(expected.parent)
      AND c.confdeltype::text = expected.on_delete AND c.confupdtype::text = expected.on_update
);
