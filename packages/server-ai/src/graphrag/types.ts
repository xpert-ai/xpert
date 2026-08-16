import { DocumentInterface } from '@langchain/core/documents'
import {
    DocumentMetadata,
    GraphRagConfig,
    IKnowledgebase,
    KnowledgeFilterDiagnostics,
    TKBRetrievalSettings
} from '@xpert-ai/contracts'
import type { KnowledgeGraphFilterScope } from '../knowledgebase/filter'

export const JOB_KNOWLEDGE_GRAPH_INDEX = 'knowledge-graph-index'

export type TKnowledgeGraphIndexQueueJob = {
    userId?: string | null
    tenantId?: string | null
    organizationId?: string | null
    knowledgebaseId: string
    graphIndexJobId: string
}

export type TKnowledgeGraphEnqueueInput = {
    userId?: string | null
    tenantId?: string | null
    organizationId?: string | null
    knowledgebaseId: string
    documentIds: string[]
    reason: 'document' | 'rebuild'
}

export type TKnowledgeGraphSearchInput = {
    tenantId?: string | null
    organizationId?: string | null
    knowledgebase: IKnowledgebase
    query: string
    k?: number
    retrieval?: TKBRetrievalSettings
    graphRag?: GraphRagConfig | null
    filterScope?: KnowledgeGraphFilterScope
}

export type TKnowledgeGraphSearchResult = {
    docs: DocumentInterface<DocumentMetadata>[]
    failed?: boolean
    error?: string
    diagnostics?: Partial<KnowledgeFilterDiagnostics>
}

export type TKnowledgeGraphExtractionEntity = {
    name: string
    type: string
    aliases?: string[] | null
    description?: string | null
    confidence?: number | null
    evidence?: Array<{
        chunkId: string
        quote?: string | null
        confidence?: number | null
    }> | null
}

export type TKnowledgeGraphExtractionRelation = {
    sourceName: string
    sourceType: string
    targetName: string
    targetType: string
    type: string
    description?: string | null
    confidence?: number | null
    evidence?: Array<{
        chunkId: string
        quote?: string | null
        confidence?: number | null
    }> | null
}

export type TKnowledgeGraphExtraction = {
    entities: TKnowledgeGraphExtractionEntity[]
    relations: TKnowledgeGraphExtractionRelation[]
}
