/* xpert-migration
{ "phase": "after-sync", "mode": "transactional", "dependsOn": [] }
*/
-- Preserve explicit assignments and all legacy connections. The first legacy connection
-- per scope/purpose wins, matching the compatibility resolver; invalid bindings are skipped.
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
INSERT INTO copilot_role_default ("tenantId", "organizationId", "scopeKey", role, mode, binding)
SELECT "tenantId", "organizationId", coalesce("organizationId"::text, 'tenant'), role, 'fixed',
       jsonb_build_object('copilotId', id::text, 'model', model, 'modelType', "modelType", 'options', coalesce(options::jsonb, '{}'::jsonb))
FROM candidates
ON CONFLICT ("tenantId", "scopeKey", role) DO NOTHING;
