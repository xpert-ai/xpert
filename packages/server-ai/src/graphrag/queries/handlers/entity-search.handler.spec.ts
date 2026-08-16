import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { KnowledgeGraphEntity } from '../../entities'
import { KnowledgeGraphEntitySearchQuery } from '../knowledge-graph-entity-search.query'
import { KnowledgeGraphEntitySearchHandler } from './entity-search.handler'

function enabledKnowledgebase() {
    return {
        id: 'kb-1',
        name: 'Graph KB',
        type: KnowledgebaseTypeEnum.Standard,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        graphRag: { enabled: true }
    }
}

describe('KnowledgeGraphEntitySearchHandler', () => {
    it('returns active semantic graph entities in vector rank order for agent exploration', async () => {
        const activeEntityQuery = {
            select: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            getMany: jest.fn(async () => [{ id: 'entity-2' }, { id: 'entity-1' }])
        }
        activeEntityQuery.select.mockReturnValue(activeEntityQuery)
        activeEntityQuery.where.mockReturnValue(activeEntityQuery)
        activeEntityQuery.andWhere.mockReturnValue(activeEntityQuery)

        const entityRepository = {
            createQueryBuilder: jest.fn(() => activeEntityQuery),
            find: jest.fn(async () => [
                { id: 'entity-1', knowledgebaseId: 'kb-1', name: 'Pump station', type: 'facility' },
                { id: 'entity-2', knowledgebaseId: 'kb-1', name: 'GOODSPRINGS', type: 'company' }
            ])
        }
        const vectorStore = {
            similaritySearchWithScore: jest.fn(async () => [
                [{ pageContent: 'GOODSPRINGS', metadata: { graphEntityId: 'entity-2' } }, 0.08],
                [{ pageContent: 'Pump station', metadata: { graphEntityId: 'entity-1' } }, 0.19],
                [{ pageContent: 'Hidden', metadata: { graphEntityId: 'entity-hidden' } }, 0.2]
            ])
        }
        const knowledgebaseService = {
            getGraphEntityVectorStore: jest.fn(async () => vectorStore)
        }
        const handler = new KnowledgeGraphEntitySearchHandler(
            entityRepository as unknown as Repository<KnowledgeGraphEntity>,
            knowledgebaseService as unknown as KnowledgebaseService
        )

        const result = await handler.execute(
            new KnowledgeGraphEntitySearchQuery({
                knowledgebase: enabledKnowledgebase(),
                query: 'pump-station supplier',
                take: 10
            })
        )

        expect(vectorStore.similaritySearchWithScore).toHaveBeenCalledWith('pump-station supplier', 10, {
            kind: 'knowledge_graph_entity',
            knowledgebaseId: 'kb-1'
        })
        expect(result.map(({ entity, score }) => ({ id: entity.id, score }))).toEqual([
            { id: 'entity-2', score: 0.92 },
            { id: 'entity-1', score: 0.81 }
        ])
    })
})
