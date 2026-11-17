WITH required(name, type) AS (
  VALUES ('decisionIntegrationId', 'uuid'), ('decisionAppId', 'character varying'),
         ('decisionChatDigest', 'character varying'), ('decisionRoute', 'jsonb')
)
SELECT name AS missing
FROM required
WHERE NOT EXISTS (
  SELECT 1 FROM pg_attribute a
  WHERE a.attrelid = to_regclass('agent_output_delivery') AND a.attname = required.name
    AND NOT a.attisdropped AND NOT a.attnotnull AND format_type(a.atttypid, a.atttypmod) = required.type
)
UNION ALL
SELECT 'uq_agent_output_decision_message'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_index i
  WHERE i.indexrelid = to_regclass('uq_agent_output_decision_message')
    AND i.indrelid = to_regclass('agent_output_delivery') AND i.indisunique AND i.indisvalid AND i.indisready
    AND ARRAY(SELECT pg_get_indexdef(i.indexrelid, n, true) FROM generate_series(1, i.indnkeyatts) AS n)
        = ARRAY['"tenantId"', '"organizationId"', '"decisionIntegrationId"', '"decisionAppId"', '"providerMessageId"']
    AND pg_get_expr(i.indpred, i.indrelid) = '("decisionIntegrationId" IS NOT NULL)'
);
