// Inventory only: direct relations prove stored configuration references, never runtime activity.
// Every source is tenant-scoped; archived/deleted Assistant versions stay separate from current records.
export const boundModelsSql = `WITH RECURSIVE binding_links AS (
    SELECT id, id AS root FROM copilot_model WHERE "tenantId" = $1 AND "copilotId" = $2
    UNION
    SELECT m.id, b.root FROM copilot_model m JOIN binding_links b ON m."referencedId" = b.id WHERE m."tenantId" = $1
), bound_models AS (
    SELECT b.id, b.root, m."organizationId", COALESCE(m.model, r.model) AS model,
        COALESCE(m."modelType", r."modelType") AS "modelType"
    FROM binding_links b JOIN copilot_model m ON m.id = b.id AND m."tenantId" = $1
        JOIN copilot_model r ON r.id = b.root AND r."tenantId" = $1
)`

const assistantStatus = `CASE WHEN a.latest = false OR a."deletedAt" IS NOT NULL THEN 'historical'
    WHEN a."publishAt" IS NOT NULL THEN 'published' ELSE 'current' END`

export const directReferencesSql = `${boundModelsSql}, owners AS (
    SELECT 'assistant' AS "resourceType", a.id AS "resourceId", a.name AS "resourceName",
        a."organizationId", a.version, ${assistantStatus} AS status,
        'copilotModelId' AS field, a."copilotModelId" AS "bindingId"
    FROM xpert a WHERE a."tenantId" = $1
    UNION ALL
    SELECT 'assistant', a.id, a.name, a."organizationId", a.version, ${assistantStatus},
        'agents[' || agent.id || '].copilotModelId', agent."copilotModelId"
    FROM xpert_agent agent JOIN xpert a ON (agent."teamId" = a.id OR agent."xpertId" = a.id)
        AND a."tenantId" = $1 WHERE agent."tenantId" = $1
    UNION ALL
    SELECT 'knowledgebase', k.id, k.name, k."organizationId", NULL,
        CASE WHEN k."deletedAt" IS NULL THEN 'current' ELSE 'historical' END, f.field, f.id
    FROM knowledgebase k CROSS JOIN LATERAL (VALUES
        ('copilotModelId', k."copilotModelId"), ('chatModelId', k."chatModelId"),
        ('wikiModelId', k."wikiModelId"), ('pendingCopilotModelId', k."pendingCopilotModelId"),
        ('rerankModelId', k."rerankModelId"), ('visionModelId', k."visionModelId")
    ) f(field, id) WHERE k."tenantId" = $1
    UNION ALL
    SELECT 'project', id, name, "organizationId", NULL, 'current', 'copilotModelId', "copilotModelId"
    FROM xpert_project WHERE "tenantId" = $1
    UNION ALL
    SELECT 'connection', id, COALESCE(name, id::text), "organizationId", NULL,
        CASE WHEN "deletedAt" IS NULL THEN 'current' ELSE 'historical' END, 'copilotModelId', "copilotModelId"
    FROM copilot WHERE "tenantId" = $1
)
SELECT o.*, b.model, b."modelType", b.root FROM owners o JOIN bound_models b ON b.id = o."bindingId"`

// JSON inspection deliberately does not label nested snapshots as effective model references.
// Select only candidate documents, then return paths and safe model metadata, never the source JSON to clients.
export const documentsSql = `${boundModelsSql}, documents AS (
    SELECT 'assistant' AS "resourceType", a.id AS "resourceId", a.name AS "resourceName",
        a."organizationId", a.version,
        CASE WHEN a.latest = false OR a."deletedAt" IS NOT NULL THEN 'historical'
            WHEN d.field = 'draft' THEN 'draft'
            WHEN a."publishAt" IS NOT NULL THEN 'published' ELSE 'current' END AS status,
        d.field, d.document
    FROM xpert a CROSS JOIN LATERAL (VALUES
        ('draft', a.draft::jsonb), ('graph', a.graph::jsonb), ('options', a.options::jsonb),
        ('agentConfig', a."agentConfig"::jsonb), ('memory', a.memory::jsonb),
        ('summarize', a.summarize::jsonb), ('features', a.features::jsonb),
        ('exportedTemplate', a."exportedTemplate"::jsonb)
    ) d(field, document) WHERE a."tenantId" = $1
    UNION ALL
    SELECT 'assistant', a.id, a.name, a."organizationId", a.version, ${assistantStatus},
        'agents[' || agent.id || '].options', agent.options::jsonb
    FROM xpert_agent agent JOIN xpert a ON (agent."teamId" = a.id OR agent."xpertId" = a.id)
        AND a."tenantId" = $1 WHERE agent."tenantId" = $1
)
SELECT * FROM documents d WHERE
    jsonb_path_exists(document, '$.**.copilotId ? (@ == $id)', jsonb_build_object('id', $2::text))
    OR jsonb_path_exists(document, '$.**.copilot.id ? (@ == $id)', jsonb_build_object('id', $2::text))
    OR EXISTS (SELECT 1 FROM bound_models b WHERE
        jsonb_path_exists(document, '$.**.referencedId ? (@ == $id)', jsonb_build_object('id', b.id::text))
        OR jsonb_path_exists(document, '$.**.copilotModelId ? (@ == $id)', jsonb_build_object('id', b.id::text))
        OR jsonb_path_exists(document, '$.**.copilotModel.id ? (@ == $id)', jsonb_build_object('id', b.id::text)))`
