-- Each valid legacy choice has an assignment; explicit settings may intentionally differ.
WITH ranked AS (
    SELECT c.*, row_number() OVER (
        PARTITION BY c."tenantId", c."organizationId", c.role
        ORDER BY c."createdAt" ASC, c.id ASC
    ) AS priority
    FROM copilot c
    WHERE c.enabled = true AND c."tenantId" IS NOT NULL
      AND c.role IN ('primary', 'secondary', 'reasoning', 'embedding')
), candidates AS (
    SELECT c.id, c."tenantId", c."organizationId", c.role, m.model, m."modelType", m.options
    FROM ranked c JOIN copilot_model m ON m.id = c."copilotModelId"
    WHERE c.priority = 1 AND length(btrim(m.model)) > 0
      AND m."modelType" = CASE WHEN c.role = 'embedding' THEN 'text-embedding' ELSE 'llm' END
      AND (m.options IS NULL OR jsonb_typeof(m.options::jsonb) = 'object')
      AND NOT EXISTS (
          SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(m.options::jsonb) = 'object' THEN m.options::jsonb ELSE '{}'::jsonb END) o
          WHERE jsonb_typeof(o.value) NOT IN ('string', 'number', 'boolean', 'null')
      )
)
SELECT 'legacy_default_missing' AS missing
FROM candidates c
WHERE NOT EXISTS (
    SELECT 1 FROM copilot_role_default d
    WHERE d."tenantId" = c."tenantId"
      AND d."scopeKey" = coalesce(c."organizationId"::text, 'tenant')
      AND d.role = c.role
);
