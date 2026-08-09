import { KnowledgeGraphStatus } from '@xpert-ai/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { KnowledgeGraphEntity } from '../../entities'
import { KnowledgeGraphEntitySearchQuery } from '../knowledge-graph-entity-search.query'

const ACTIVE_VISIBILITY = 'active'

@QueryHandler(KnowledgeGraphEntitySearchQuery)
export class KnowledgeGraphEntitySearchHandler implements IQueryHandler<KnowledgeGraphEntitySearchQuery> {
    constructor(
        @InjectRepository(KnowledgeGraphEntity)
        private readonly entityRepository: Repository<KnowledgeGraphEntity>,
        private readonly knowledgebaseService: KnowledgebaseService
    ) {}

    async execute({ input }: KnowledgeGraphEntitySearchQuery) {
        const { knowledgebase, query } = input
        if (knowledgebase.graphRag?.enabled !== true || knowledgebase.graphStatus === KnowledgeGraphStatus.DISABLED) {
            return []
        }

        const limit = Math.min(100, Math.max(1, Math.trunc(input.take ?? 12)))
        const vectorStore = await this.knowledgebaseService.getGraphEntityVectorStore(knowledgebase, true)
        const results = await vectorStore.similaritySearchWithScore(query, limit, {
            kind: 'knowledge_graph_entity',
            knowledgebaseId: knowledgebase.id
        })
        const seen = new Set<string>()
        const scored = results
            .map(([doc, score]) => ({
                entityId: typeof doc.metadata?.graphEntityId === 'string' ? doc.metadata.graphEntityId : null,
                score: 1 - score
            }))
            .filter((item): item is { entityId: string; score: number } => {
                if (!item.entityId || seen.has(item.entityId)) return false
                seen.add(item.entityId)
                return true
            })
        if (!scored.length) return []

        const activeEntities = await this.entityRepository
            .createQueryBuilder('entity')
            .select('entity.id')
            .where('entity.knowledgebaseId = :knowledgebaseId', { knowledgebaseId: knowledgebase.id })
            .andWhere('entity.id IN (:...entityIds)', { entityIds: scored.map(({ entityId }) => entityId) })
            .andWhere('(entity.visibility = :visibility OR entity.visibility IS NULL)', {
                visibility: ACTIVE_VISIBILITY
            })
            .getMany()
        const activeIds = new Set(activeEntities.map(({ id }) => id))
        const eligible = scored.filter(({ entityId }) => activeIds.has(entityId))
        if (!eligible.length) return []

        const entities = await this.entityRepository.find({
            where: {
                knowledgebaseId: knowledgebase.id,
                id: In(eligible.map(({ entityId }) => entityId))
            }
        })
        const byId = new Map(entities.map((entity) => [entity.id, entity]))
        return eligible.flatMap(({ entityId, score }) => {
            const entity = byId.get(entityId)
            return entity ? [{ entity, score }] : []
        })
    }
}
