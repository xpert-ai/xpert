import { IKnowledgebase, KnowledgeWikiDocumentProgress } from '@xpert-ai/contracts'
import type { EntityManager } from 'typeorm'
import { deriveDocumentWikiProgress, DocumentWikiProgressRow } from './knowledge-wiki-document-progress'

// A source_map only completes extraction. Follow its publication batch and current-attempt versions.
// All joins stay inside the authorized tenant/organization/knowledgebase; no per-document queries.
export async function queryKnowledgeWikiDocumentProgress(
    manager: Pick<EntityManager, 'query'>,
    kb: Pick<IKnowledgebase, 'id' | 'tenantId' | 'organizationId' | 'wikiConfig'>,
    documentIds: string[],
    indexedDocumentIds: string[],
    canManage: boolean
): Promise<KnowledgeWikiDocumentProgress[]> {
    if (!kb.wikiConfig?.enabled || !documentIds.length) return []
    const rows = await manager.query<DocumentWikiProgressRow[]>(
        `
        WITH jobs AS (
            SELECT * FROM knowledge_wiki_job
            WHERE "knowledgebaseId" = $1 AND "tenantId" IS NOT DISTINCT FROM $2
                AND "organizationId" IS NOT DISTINCT FROM $3
        ), sources AS (
            SELECT d.id AS "documentId", d.status AS "documentStatus", d.disabled,
                s."sourceDocumentIdSnapshot" IS NOT NULL AS "hasSource",
                s.eligible AND s."lastContentHash" = d."contentHash" AS "currentSource",
                s."cleanupPending" OR s."cleanupFailed" OR s."generationPendingReason" IS NOT NULL AS "needsUpdate",
                s."generationPending", m.id AS "mapId", m.status AS "mapStatus",
                m."isCurrent" AND m."sourceContentHash" = d."contentHash"
                    AND m."sourceLifecycleGeneration" = s."lifecycleGeneration"
                    AND coalesce(m."sourcePublicationEpoch", 0) = coalesce(d."publicationEpoch", 0)
                    AND (root.id IS NULL OR (root."isCurrent" AND root.status NOT IN ('stale', 'cancelled'))) AS "mapCurrent",
                CASE WHEN root.type = 'rebuild' THEN root.id ELSE m.id END AS "pipelineId",
                root.type = 'rebuild' AS rebuild
            FROM knowledge_document d
            LEFT JOIN knowledge_wiki_source_state s ON s."sourceDocumentIdSnapshot" = d.id
                AND s."knowledgebaseId" = $1 AND s."tenantId" IS NOT DISTINCT FROM $2
                AND s."organizationId" IS NOT DISTINCT FROM $3
            LEFT JOIN jobs m ON m.id = s."desiredRootJobId" AND m.type = 'source_map'
                AND m."sourceDocumentIdSnapshot" = d.id
            LEFT JOIN jobs root ON root.id = m."parentJobId"
            WHERE d."knowledgebaseId" = $1 AND d."tenantId" IS NOT DISTINCT FROM $2
                AND d."organizationId" IS NOT DISTINCT FROM $3
                AND d.id = ANY($4::uuid[]) AND d."deletedAt" IS NULL AND d."hardDeletePendingAt" IS NULL
        ), related AS (
            SELECT s."documentId", j.* FROM sources s JOIN jobs j ON j."isCurrent"
                AND j.type = 'page_reduce' AND j."parentJobId" = s."pipelineId"
            WHERE NOT coalesce(s.rebuild, false) OR EXISTS (
                SELECT 1 FROM knowledge_wiki_source_map_result r
                WHERE r."sourceJobId" = s."mapId" AND r."normalizedPageKey" = j."pageKey"
                    AND r."knowledgebaseId" = $1 AND r."tenantId" IS NOT DISTINCT FROM $2
                    AND r."organizationId" IS NOT DISTINCT FROM $3
            )
        )
        SELECT s.*, (coalesce(reductions.pending, false) OR EXISTS (
            SELECT 1 FROM jobs j WHERE j."parentJobId" = s."pipelineId" AND j.type = 'identity_resolve'
                AND j."isCurrent" AND j.status <> 'succeeded'
        )) AS "reducePending",
            coalesce(versions.count, 0) AS "versionCount",
            coalesce(versions.pending, false) AS "projectionPending",
            coalesce(versions.failed, false) AS "projectionFailed",
            final.status AS "finalizeStatus", blocker.id AS "failureJobId", blocker.type AS "failureType",
            blocker.id IS NOT NULL AND blocker.id <> s."mapId" AND blocker.type NOT IN ('finalize', 'identity_resolve')
                AND NOT EXISTS (SELECT 1 FROM related r WHERE r."documentId" = s."documentId" AND r.id = blocker.id)
                AS "failureShared",
            CASE WHEN $5 THEN blocker.error END AS "failureError",
            CASE WHEN $5 THEN blocker."errorCode" END AS "failureCode",
            EXISTS (SELECT 1 FROM jobs b WHERE s.rebuild AND b."isCurrent"
                AND b."parentJobId" = s."pipelineId" AND b.id <> s."mapId"
                AND b.status IN ('queued', 'running', 'failed') AND b.type IN ('source_map', 'identity_resolve', 'page_reduce')) AS "batchPending",
            EXISTS (SELECT 1 FROM knowledge_wiki_model_invocation i
                WHERE $5 AND i."jobId" = blocker.id AND i."generationAttempt" = blocker."generationAttempt"
                    AND i.status = 'indeterminate' AND i."knowledgebaseId" = $1
                    AND i."tenantId" IS NOT DISTINCT FROM $2 AND i."organizationId" IS NOT DISTINCT FROM $3) AS uncertain
        FROM sources s
        LEFT JOIN LATERAL (
            SELECT bool_or(j.status <> 'succeeded') AS pending FROM related j WHERE j."documentId" = s."documentId"
        ) reductions ON true
        LEFT JOIN LATERAL (
            SELECT count(*)::int AS count, bool_or(v."projectionStatus" <> 'ready') AS pending,
                bool_or(v."projectionStatus" = 'failed') AS failed
            FROM related j JOIN knowledge_wiki_page_version v ON v."producerJobId" = j.id
                AND v."generationAttempt" = j."generationAttempt"
                AND v."knowledgebaseId" = $1 AND v."tenantId" IS NOT DISTINCT FROM $2
                AND v."organizationId" IS NOT DISTINCT FROM $3
            WHERE j."documentId" = s."documentId"
        ) versions ON true
        LEFT JOIN LATERAL (
            SELECT j.status FROM jobs j WHERE j."parentJobId" = s."pipelineId"
                AND j.type = 'finalize' AND j."isCurrent" ORDER BY j."createdAt" DESC, j.id LIMIT 1
        ) final ON true
        LEFT JOIN LATERAL (
            SELECT j.* FROM jobs j WHERE j."isCurrent" AND j.status = 'failed'
                AND (j.id = s."mapId" OR j.id = s."pipelineId" OR j."parentJobId" = s."pipelineId")
            ORDER BY CASE WHEN j.type = 'finalize' THEN 1 ELSE 0 END, j."createdAt", j.id LIMIT 1
        ) blocker ON true
    `,
        [kb.id, kb.tenantId ?? null, kb.organizationId ?? null, documentIds, canManage]
    )
    const indexed = new Set(indexedDocumentIds)
    return rows.map((row) => deriveDocumentWikiProgress(row, indexed.has(row.documentId), canManage))
}
