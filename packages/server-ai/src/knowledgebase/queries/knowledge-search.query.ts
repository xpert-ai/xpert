import {
    DocumentMetadata,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterSources,
    KnowledgeRetrievalContentScope,
    TCopilotModel,
    TKBRetrievalSettings
} from '@xpert-ai/contracts'
import { DocumentInterface } from '@langchain/core/documents'
import { IQuery } from '@nestjs/cqrs'

export type KnowledgeSearchResult = {
    documents: DocumentInterface<DocumentMetadata>[]
    diagnostics: KnowledgeFilterDiagnostics[]
}

export class KnowledgeSearchQuery implements IQuery {
    static readonly type = '[Knowledgebase] Similarity Search'

    constructor(
        public readonly input: {
            tenantId: string
            organizationId: string
            knowledgebases: string[]
            query: string
            k?: number
            /** Null disables internal vector filtering; undefined inherits the knowledgebase threshold. */
            score?: number | null
            /** Undefined uses the knowledgebase rerank model; null disables reranking. */
            rerankModel?: TCopilotModel | null
            /** Undefined inherits the knowledgebase rerank threshold; null disables threshold filtering. */
            rerankThreshold?: number | null
            filters?: KnowledgeFilterSources
            /** Runtime state used only to resolve mandatory fixed-filter variables. */
            variables?: Record<string, unknown>
            retrieval?: TKBRetrievalSettings
            contentScope?: KnowledgeRetrievalContentScope
            source: string
            id?: string // Request ID for tracing the request
            xpertId?: string
            threadId?: string
        }
    ) {}
}
