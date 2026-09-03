import { DocumentInterface } from '@langchain/core/documents'
import {
    DocumentMetadata,
    IKnowledgebase,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterErrorCode,
    TKBRetrievalSettings
} from '@xpert-ai/contracts'
import { PreparedKnowledgeFilter } from '../filter'

export type KnowledgeRetrieverSource = 'vector' | 'graph' | 'keyword'

export type KnowledgeRetrievalRequest = {
    knowledgebase: IKnowledgebase
    query: string
    k?: number
    retrieval?: TKBRetrievalSettings
    scope: {
        tenantId: string
        organizationId: string
    }
    modelContext: {
        xpertId?: string
        threadId?: string
    }
    preparedFilter: PreparedKnowledgeFilter
}

export type KnowledgeRetrievalCandidate = {
    document: DocumentInterface<DocumentMetadata>
    rank: number
}

export type KnowledgeRetrievalBatch = {
    source: KnowledgeRetrieverSource
    candidates: KnowledgeRetrievalCandidate[]
    diagnostics: KnowledgeFilterDiagnostics
    failed?: boolean
    error?: string
}

export class KnowledgeRetrievalFailure extends Error {
    readonly name = 'KnowledgeRetrievalFailure'

    constructor(
        readonly source: KnowledgeRetrieverSource,
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
