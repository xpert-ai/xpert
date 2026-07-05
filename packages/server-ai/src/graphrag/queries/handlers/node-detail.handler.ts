import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GraphragService } from '../../graphrag.service'
import { KnowledgeGraphNodeDetailQuery } from '../knowledge-graph-node-detail.query'

@QueryHandler(KnowledgeGraphNodeDetailQuery)
export class KnowledgeGraphNodeDetailHandler implements IQueryHandler<KnowledgeGraphNodeDetailQuery> {
    constructor(private readonly service: GraphragService) {}

    async execute(query: KnowledgeGraphNodeDetailQuery) {
        const { knowledgebaseId, entityId } = query.input
        const [neighborhood, chunkEvidence] = await Promise.all([
            this.service.getNeighborhood(knowledgebaseId, entityId),
            this.service.getEntityChunks(knowledgebaseId, entityId, query.input.query)
        ])

        return {
            ...neighborhood,
            chunks: chunkEvidence.chunks,
            evidenceByChunkId: chunkEvidence.evidenceByChunkId,
            totals: chunkEvidence.totals,
            limits: chunkEvidence.limits,
            truncated: chunkEvidence.truncated
        }
    }
}
