import { IKnowledgebase, KBDocumentStatusEnum, KnowledgeWikiDocumentStatusResponse } from '@xpert-ai/contracts'
import type { EntityManager } from 'typeorm'

// Match published-page visibility; parsing or a successful map job alone is not Wiki completion.
export async function queryKnowledgeWikiDocumentStatus(
    manager: Pick<EntityManager, 'query'>,
    knowledgebase: Pick<IKnowledgebase, 'id' | 'tenantId' | 'organizationId' | 'wikiConfig' | 'wikiAvailability'>,
    documentIds: string[]
): Promise<KnowledgeWikiDocumentStatusResponse> {
    if (!knowledgebase.wikiConfig?.enabled || knowledgebase.wikiAvailability === 'unavailable' || !documentIds.length) {
        return { indexedDocumentIds: [] }
    }
    const rows = await manager.query<Array<{ documentId: string }>>(
        `WITH valid_sources AS (
            SELECT d.id, d."contentHash"
            FROM knowledge_document d
            JOIN knowledge_wiki_source_state s
                ON s."sourceDocumentIdSnapshot" = d.id
                AND s."knowledgebaseId" = $1
                AND s."tenantId" IS NOT DISTINCT FROM $2
                AND s."organizationId" IS NOT DISTINCT FROM $3
                AND s.eligible = true AND s."cleanupPending" = false AND s."cleanupFailed" = false
                AND s."lastContentHash" = d."contentHash"
            WHERE d."knowledgebaseId" = $1
                AND d."tenantId" IS NOT DISTINCT FROM $2
                AND d."organizationId" IS NOT DISTINCT FROM $3
                AND d.disabled IS NOT TRUE AND d."deletedAt" IS NULL AND d."hardDeletePendingAt" IS NULL
                AND d.status = $5
        )
        SELECT DISTINCT e."sourceDocumentIdSnapshot" AS "documentId"
        FROM knowledge_wiki_page_evidence e
        JOIN knowledge_wiki_page p ON p.id = e."pageId" AND p."activeVersionId" = e."pageVersionId"
            AND p."knowledgebaseId" = $1
            AND p."tenantId" IS NOT DISTINCT FROM $2 AND p."organizationId" IS NOT DISTINCT FROM $3
            AND p.status = 'ready' AND p."projectionStatus" = 'ready'
        JOIN knowledge_wiki_page_version v ON v.id = p."activeVersionId" AND v."pageId" = p.id
            AND v."knowledgebaseId" = $1
            AND v."tenantId" IS NOT DISTINCT FROM $2 AND v."organizationId" IS NOT DISTINCT FROM $3
            AND v.status = 'ready' AND v."projectionStatus" = 'ready'
        JOIN valid_sources s ON s.id = e."sourceDocumentIdSnapshot" AND s."contentHash" = e."sourceContentHash"
        WHERE e."knowledgebaseId" = $1
            AND e."tenantId" IS NOT DISTINCT FROM $2 AND e."organizationId" IS NOT DISTINCT FROM $3
            AND e."sourceDocumentIdSnapshot" = ANY($4::uuid[])
            AND NOT EXISTS (
                SELECT 1 FROM knowledge_wiki_page_evidence other
                LEFT JOIN valid_sources current_source ON current_source.id = other."sourceDocumentIdSnapshot"
                    AND current_source."contentHash" = other."sourceContentHash"
                WHERE other."pageVersionId" = v.id
                    AND (current_source.id IS NULL
                        OR other."knowledgebaseId" IS DISTINCT FROM $1
                        OR other."tenantId" IS DISTINCT FROM $2 OR other."organizationId" IS DISTINCT FROM $3)
            )`,
        [
            knowledgebase.id,
            knowledgebase.tenantId ?? null,
            knowledgebase.organizationId ?? null,
            documentIds,
            KBDocumentStatusEnum.FINISH
        ]
    )
    return { indexedDocumentIds: rows.map((row) => row.documentId) }
}
