import {
    DocumentMetadata,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterSources,
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
            score?: number
            filters?: KnowledgeFilterSources
            /** Runtime state used only to resolve mandatory fixed-filter variables. */
            variables?: Record<string, unknown>
            retrieval?: TKBRetrievalSettings
            source: string
            id?: string // Request ID for tracing the request
            xpertId?: string
            threadId?: string
        }
    ) {}
}
