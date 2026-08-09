export const JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING = 'rebuild-knowledgebase-embedding'

export type TKnowledgebaseRebuildEmbeddingJob = {
    userId: string
    tenantId?: string | null
    organizationId?: string | null
    knowledgebaseId: string
    rebuildTaskId: string
    pendingEmbeddingRevision: number
}
