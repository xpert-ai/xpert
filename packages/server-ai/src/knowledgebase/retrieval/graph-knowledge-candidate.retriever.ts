import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { KnowledgeGraphSearchQuery } from '../../graphrag/queries'
import { TKnowledgeGraphSearchResult } from '../../graphrag/types'
import { createKnowledgeGraphFilterScope } from '../filter'
import { KnowledgeCandidateRetriever, KnowledgeRetrievalBatch, KnowledgeRetrievalRequest } from './types'

@Injectable()
export class GraphKnowledgeCandidateRetriever implements KnowledgeCandidateRetriever {
    readonly source = 'graph' as const

    constructor(private readonly queryBus: QueryBus) {}

    async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalBatch> {
        const result = await this.queryBus.execute<KnowledgeGraphSearchQuery, TKnowledgeGraphSearchResult>(
            new KnowledgeGraphSearchQuery({
                tenantId: request.scope.tenantId,
                organizationId: request.scope.organizationId,
                knowledgebase: request.knowledgebase,
                query: request.query,
                k: request.k,
                retrieval: request.retrieval,
                graphRag: request.knowledgebase.graphRag,
                filterScope: createKnowledgeGraphFilterScope({
                    tenantId: request.scope.tenantId,
                    organizationId: request.scope.organizationId,
                    knowledgebaseId: request.knowledgebase.id,
                    prepared: request.preparedFilter
                }),
                ...request.modelContext
            })
        )

        return {
            source: this.source,
            candidates: result.docs.map((document, index) => ({ document, rank: index + 1 })),
            diagnostics: {
                ...request.preparedFilter.diagnostics,
                ...result.diagnostics
            },
            failed: result.failed,
            error: result.error
        }
    }
}
