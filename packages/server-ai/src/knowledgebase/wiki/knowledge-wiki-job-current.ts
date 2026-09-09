import type { Repository } from 'typeorm'
import type { KnowledgeWikiJob } from './entities'

// The outer job alias is shared by status queries and retirement. Rebuild stages share one
// publication batch: replacing any source invalidates that batch, including source-less stages.
export const KNOWLEDGE_WIKI_SUPERSEDED_JOB_SQL = `EXISTS (
    SELECT 1 FROM knowledge_wiki_job source
    INNER JOIN knowledge_wiki_source_state state
        ON state."knowledgebaseId" = source."knowledgebaseId"
        AND state."tenantId" IS NOT DISTINCT FROM source."tenantId"
        AND state."organizationId" IS NOT DISTINCT FROM source."organizationId"
        AND state."sourceDocumentIdSnapshot" = source."sourceDocumentIdSnapshot"
    WHERE source."knowledgebaseId" = job."knowledgebaseId"
        AND source."tenantId" IS NOT DISTINCT FROM job."tenantId"
        AND source."organizationId" IS NOT DISTINCT FROM job."organizationId"
        AND source.type IN ('source_map', 'retract')
        AND (source.id = job.id OR (
            coalesce(source."rootJobId", source.id) = coalesce(job."rootJobId", job.id)
            AND NOT EXISTS (
                SELECT 1 FROM knowledge_wiki_job replacement
                WHERE replacement.id = state."desiredRootJobId"
                    AND replacement."knowledgebaseId" = source."knowledgebaseId"
                    AND replacement."tenantId" IS NOT DISTINCT FROM source."tenantId"
                    AND replacement."organizationId" IS NOT DISTINCT FROM source."organizationId"
                    AND coalesce(replacement."rootJobId", replacement.id) = coalesce(source."rootJobId", source.id)
            )
        ))
        AND (source."sourceLifecycleGeneration" < state."lifecycleGeneration"
            OR (source."sourceLifecycleGeneration" = state."lifecycleGeneration"
                AND state."desiredRootJobId" IS NOT NULL AND state."desiredRootJobId" <> source.id))
)`

export async function retireSupersededKnowledgeWikiJobs(
    jobs: Pick<Repository<KnowledgeWikiJob>, 'query'>,
    knowledgebaseId?: string
) {
    await jobs.query(
        `UPDATE knowledge_wiki_job job SET "isCurrent" = false,
            status = CASE WHEN status IN ('succeeded', 'cancelled') THEN status ELSE 'stale' END,
            "completedAt" = coalesce("completedAt", now()), "lockedAt" = NULL,
            "leaseExpiresAt" = NULL, "heartbeatAt" = NULL, "updatedAt" = now()
        WHERE job."isCurrent" = true AND job.type <> 'classify'
            AND ($1::uuid IS NULL OR job."knowledgebaseId" = $1)
            AND ${KNOWLEDGE_WIKI_SUPERSEDED_JOB_SQL}`,
        [knowledgebaseId ?? null]
    )
}
