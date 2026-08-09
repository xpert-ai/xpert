import { KnowledgeFilterSources } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

export type KnowledgeGraphExploreAction = 'search' | 'neighbors' | 'evidence'

export class KnowledgeGraphExploreQuery implements IQuery {
    static readonly type = '[Knowledgebase] Explore knowledge graph'

    constructor(
        public readonly input: {
            tenantId?: string
            organizationId?: string
            knowledgebaseId: string
            action: KnowledgeGraphExploreAction
            query?: string
            entityId?: string
            depth?: number
            take?: number
            filters?: KnowledgeFilterSources
            variables?: Record<string, unknown>
        }
    ) {}
}
