WITH expected(name, type, required) AS (VALUES
    ('threadId', 'character varying(100)', true), ('runId', 'uuid', true),
    ('tenantId', 'uuid', true), ('organizationId', 'uuid', false), ('segmentId', 'uuid', true),
    ('revision', 'integer', true), ('cursor', 'character varying', false),
    ('snapshot', 'jsonb', false), ('savedAt', 'timestamp with time zone', true)
), columns AS (
    SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND c.relname='chat_run_display_snapshot' AND a.attnum>0 AND NOT a.attisdropped
), constraints AS (
    SELECT pg_get_constraintdef(c.oid) AS definition, c.convalidated
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=current_schema() AND t.relname='chat_run_display_snapshot'
), required_constraints(definition) AS (VALUES
    ('PRIMARY KEY ("threadId", "runId")'),
    ('FOREIGN KEY ("threadId") REFERENCES chat_conversation_thread("threadId") ON DELETE CASCADE'),
    ('FOREIGN KEY ("runId") REFERENCES xpert_agent_execution(id) ON DELETE CASCADE')
)
SELECT 'column:chat_run_display_snapshot.'||e.name AS missing FROM expected e
WHERE NOT EXISTS (SELECT 1 FROM columns a WHERE a.attname=e.name AND a.type=e.type AND a.attnotnull=e.required)
UNION ALL
SELECT 'constraint:chat_run_display_snapshot.'||e.definition FROM required_constraints e
WHERE NOT EXISTS (SELECT 1 FROM constraints c WHERE c.definition=e.definition AND c.convalidated);
