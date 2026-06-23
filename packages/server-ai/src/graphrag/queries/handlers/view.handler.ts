import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { KnowledgeGraphStatus } from '@xpert-ai/contracts'
import { GraphragService } from '../../graphrag.service'
import { KnowledgeGraphViewQuery } from '../knowledge-graph-view.query'

@QueryHandler(KnowledgeGraphViewQuery)
export class KnowledgeGraphViewHandler implements IQueryHandler<KnowledgeGraphViewQuery> {
    constructor(private readonly service: GraphragService) {}

    async execute(query: KnowledgeGraphViewQuery) {
        const { knowledgebaseId } = query.input
        const status = await this.service.getStatus(knowledgebaseId)
        const visualization =
            status.enabled && status.status !== KnowledgeGraphStatus.DISABLED
                ? await this.service.getVisualization(knowledgebaseId, query.input.query)
                : {
                      nodes: [],
                      edges: [],
                      entityTypes: [],
                      relationTypes: [],
                      totalNodes: 0,
                      totalEdges: 0
                  }

        return {
            status,
            visualization
        }
    }
}
