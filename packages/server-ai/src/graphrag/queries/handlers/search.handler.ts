import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GraphragService } from '../../graphrag.service'
import { TKnowledgeGraphSearchResult } from '../../types'
import { KnowledgeGraphSearchQuery } from '../knowledge-graph-search.query'

@QueryHandler(KnowledgeGraphSearchQuery)
export class KnowledgeGraphSearchHandler implements IQueryHandler<KnowledgeGraphSearchQuery> {
    constructor(private readonly service: GraphragService) {}

    async execute(query: KnowledgeGraphSearchQuery): Promise<TKnowledgeGraphSearchResult> {
        return this.service.search(query.input)
    }
}
