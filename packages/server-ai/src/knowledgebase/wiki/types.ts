export const JOB_KNOWLEDGE_WIKI_GENERATION = 'knowledge-wiki-generation'

export type KnowledgeWikiGenerationQueueJob = {
    jobId: string
    userId: string
    tenantId: string
    organizationId?: string | null
}

export type KnowledgeWikiEnqueueSourceInput = {
    knowledgebaseId: string
    documentId: string
    userId: string
    tenantId?: string | null
    organizationId?: string | null
    reason: 'document' | 'recover'
}

export type KnowledgeWikiRetractSourceInput = {
    knowledgebaseId: string
    documentId: string
    userId: string
    reason: 'disabled' | 'soft_deleted' | 'hard_deleted'
}

export type KnowledgeWikiRebuildInput = {
    knowledgebaseId: string
    userId: string
    confirmModelCharges: boolean
    maxModelInvocations?: number
    maxEstimatedTokens?: number
}

export type KnowledgeWikiRetryInput = {
    knowledgebaseId: string
    jobId: string
    userId: string
    confirmAdditionalModelCharge?: boolean
}

export type KnowledgeWikiMapModelOutput = {
    pages: import('@xpert-ai/contracts').KnowledgeWikiPageContributionPayload[]
}

export type KnowledgeWikiReduceModelOutput = {
    title: string
    summary: string
    contentMarkdown: string
    aliases: string[]
}

export type KnowledgeWikiModelOutput = KnowledgeWikiMapModelOutput | KnowledgeWikiReduceModelOutput
