import { DocumentInterface } from '@langchain/core/documents'
import {
    DocumentMetadata,
    IKnowledgebase,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterErrorCode,
    KnowledgeRetrievalContentScope,
    TKBRetrievalSettings
} from '@xpert-ai/contracts'
import { PreparedKnowledgeFilter } from '../filter'
import type { KnowledgeDocumentStore } from '../vector-store'
import type { FAQRetrievalBudget } from '../faq/faq-retrieval-budget'

export type KnowledgeRetrieverSource = 'vector' | 'graph' | 'keyword'

export type KnowledgeRetrievalRequest = {
    knowledgebase: IKnowledgebase
    query: string
    k?: number
    /** Minimum vector similarity before fusion or reranking. */
    score?: number | null
    retrieval?: TKBRetrievalSettings
    contentScope?: KnowledgeRetrievalContentScope
    scope: {
        tenantId: string
        organizationId: string
    }
    modelContext: {
        xpertId?: string
        threadId?: string
    }
    preparedFilter: PreparedKnowledgeFilter
    /** Shared only by one semantic FAQ request and all of its candidate expansions. */
    faqSession?: {
        budget: FAQRetrievalBudget
        /** Largest completed raw vector window, including projection expansion. */
        vectorWindow?: number
        vectorStore?: Promise<KnowledgeDocumentStore>
        vectorSearch?: ReturnType<KnowledgeDocumentStore['createSearchSession']>
    }
}

export type KnowledgeRetrievalCandidate = {
    document: DocumentInterface<DocumentMetadata>
    rank: number
}

export type KnowledgeRetrievalBatch = {
    source: KnowledgeRetrieverSource
    candidates: KnowledgeRetrievalCandidate[]
    diagnostics: KnowledgeFilterDiagnostics
    /** Based on the raw retrieval window, before canonical deduplication or negative filtering. */
    exhausted?: boolean
    budgetLimited?: boolean
    failed?: boolean
    error?: string
}

export class KnowledgeRetrievalFailure extends Error {
    readonly name = 'KnowledgeRetrievalFailure'

    constructor(
        readonly source: KnowledgeRetrieverSource | 'rerank' | 'faq',
        readonly errorCode: KnowledgeFilterErrorCode,
        readonly diagnostics: KnowledgeFilterDiagnostics,
        message: string
    ) {
        super(message)
    }
}

export interface KnowledgeCandidateRetriever {
    readonly source: KnowledgeRetrieverSource

    retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalBatch>
}

export interface KnowledgeCandidateFusion<TOptions> {
    fuse(batches: readonly KnowledgeRetrievalBatch[], options: TOptions): DocumentInterface<DocumentMetadata>[]
}
