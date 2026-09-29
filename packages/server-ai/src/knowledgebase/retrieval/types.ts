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
import type { TDocChunkMetadata } from '../../knowledge-document/types'

export type KeywordRetrievalRow = {
    chunkRowId: string
    chunkId: string
    parentChunkId?: string | null
    pageContent: string | null
    metadata: TDocChunkMetadata | null
    documentId: string
    documentName?: string | null
    sourceType?: string | null
    fileExtension?: string | null
    category?: string | null
    fileUrl?: string | null
    keywordScore: number | string
    coverage?: number | string | null
    titleOnly?: boolean
}

export type KeywordRetrievalDocument = DocumentInterface<DocumentMetadata> & {
    id: string
    children?: KeywordRetrievalDocument[]
    document: {
        id: string
        name?: string | null
        sourceType?: string | null
        type?: string | null
        category?: string | null
        fileUrl?: string | null
    }
}

export type KeywordRetrievalState = {
    queryKey: string
    rows: KeywordRetrievalRow[]
    documents: KeywordRetrievalDocument[]
    scanned: number
    phaseIndex: number
    phases: Array<{
        relaxed: boolean
        offset: number
        pageWindow: number
        exhausted: boolean
    }>
    exhausted: boolean
    budgetLimited: boolean
}

export type KnowledgeRetrieverSource = 'vector' | 'graph' | 'keyword'

export type KnowledgeRetrievalRequest = {
    knowledgebase: IKnowledgebase
    query: string
    /** Final result target (FAQ refill may expand it); retrievers can return a bounded larger candidate window. */
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
        keywordState?: KeywordRetrievalState
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
