// Only current configuration and live grants block removal. Historical versions and usage remain intact.
// Queries inspect the whole owning tenant because tenant connections can be referenced by its organizations.
// JSON bindings have no FK locks. Serialize the short check-and-purge transaction with configuration writers.
export const connectionDeletionLockSql = `LOCK TABLE
    copilot, copilot_model, copilot_role_default, xpert, xpert_agent, knowledgebase, xpert_project,
    model_gateway_publication, membership_plan, user_model_grant, model_access_request,
    model_execution_grant, realtime_voice_session
    IN SHARE ROW EXCLUSIVE MODE`

function modelReferences(document: string) {
    return `(jsonb_path_exists(${document}, '$.**.copilotId ? (@ == $id)', jsonb_build_object('id', $2::text))
        OR jsonb_path_exists(${document}, '$.**.copilot.id ? (@ == $id)', jsonb_build_object('id', $2::text))
        OR EXISTS (SELECT 1 FROM bound_models b WHERE
            jsonb_path_exists(${document}, '$.**.referencedId ? (@ == $id)', jsonb_build_object('id', b.id::text))
            OR jsonb_path_exists(${document}, '$.**.copilotModelId ? (@ == $id)', jsonb_build_object('id', b.id::text))
            OR jsonb_path_exists(${document}, '$.**.copilotModel.id ? (@ == $id)', jsonb_build_object('id', b.id::text))))`
}

export const connectionDeletionReferencesSql = `
WITH RECURSIVE bound_models AS (
    SELECT id FROM copilot_model WHERE "tenantId" = $1 AND "copilotId" = $2
    UNION
    SELECT m.id FROM copilot_model m JOIN bound_models b ON m."referencedId" = b.id
    WHERE m."tenantId" = $1
), current_assistants AS (
    SELECT * FROM xpert WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND latest IS DISTINCT FROM false
)
SELECT
    (SELECT count(*)::int FROM copilot_role_default
     WHERE "tenantId" = $1 AND mode = 'fixed'
       AND binding ->> 'copilotId' = $2::text) AS defaults,
    (SELECT count(*)::int FROM current_assistants a
     WHERE a."copilotModelId" IN (SELECT id FROM bound_models)
        OR ${modelReferences('jsonb_build_array(a.draft, a.graph, a.options, a."agentConfig")')}
        OR EXISTS (SELECT 1 FROM xpert_agent agent
            WHERE agent."tenantId" = $1
              AND (agent."teamId" = a.id OR agent."xpertId" = a.id)
              AND (agent."copilotModelId" IN (SELECT id FROM bound_models)
                OR ${modelReferences('agent.options::jsonb')}))) AS assistants,
    (SELECT count(*)::int FROM knowledgebase
     WHERE "tenantId" = $1 AND "deletedAt" IS NULL
       AND EXISTS (SELECT 1 FROM bound_models WHERE id IN
         ("copilotModelId", "chatModelId", "wikiModelId", "pendingCopilotModelId", "rerankModelId", "visionModelId"))) AS knowledgebases,
    (SELECT count(*)::int FROM xpert_project
     WHERE "tenantId" = $1
       AND "copilotModelId" IN (SELECT id FROM bound_models)) AS projects,
    (SELECT count(*)::int FROM copilot
     WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND id <> $2
       AND "copilotModelId" IN (SELECT id FROM bound_models)) AS connections,
    (SELECT count(*)::int FROM model_gateway_publication
     WHERE "tenantId" = $1 AND "copilotId" = $2) AS gateways,
    (SELECT count(*)::int FROM membership_plan
     WHERE "tenantId" = $1
       AND jsonb_path_exists("allowedModels"::jsonb, '$[*].copilotId ? (@ == $id)',
           jsonb_build_object('id', $2::text))) AS "membershipPlans",
    (SELECT count(*)::int FROM user_model_grant
     WHERE "tenantId" = $1 AND "copilotId" = $2
       AND status = 'active' AND ("validUntil" IS NULL OR "validUntil" > CURRENT_TIMESTAMP)) AS "accessGrants",
    (SELECT count(*)::int FROM model_access_request
     WHERE "tenantId" = $1 AND "copilotId" = $2
       AND status = 'requested') AS "accessRequests",
    (SELECT count(*)::int FROM model_execution_grant
     WHERE "tenantId" = $1 AND status IN ('pending', 'active')
       AND "expiresAt" > CURRENT_TIMESTAMP AND "absoluteExpiresAt" > CURRENT_TIMESTAMP
       AND jsonb_path_exists(models, '$[*].copilotId ? (@ == $id)',
           jsonb_build_object('id', $2::text))) AS executions,
    (SELECT count(*)::int FROM realtime_voice_session
     WHERE "tenantId" = $1 AND status IN ('connecting', 'active')
       AND "expiresAt" > CURRENT_TIMESTAMP AND "modelSnapshot" ->> 'copilotId' = $2::text) AS "voiceSessions"
`
