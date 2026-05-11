import { Queue } from 'bull'
import { QueryBus } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgeDocumentChunkService } from '../knowledge-document/chunk/chunk.service'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'
import {
    KnowledgeGraphCommunity,
    KnowledgeGraphEntity,
    KnowledgeGraphIndexJob,
    KnowledgeGraphMention,
    KnowledgeGraphRelation
} from './entities'
import { GraphragService, normalizeKnowledgeGraphName, normalizeKnowledgeGraphType } from './graphrag.service'
import { TKnowledgeGraphIndexQueueJob } from './types'

function repositoryMock<T>() {
    return {} as unknown as Repository<T>
}

function enabledKnowledgebase() {
    return {
        id: 'kb-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        graphRevision: 3,
        graphRag: {
            enabled: true
        }
    }
}

function deleteQueryBuilderMock() {
    const query = {
        delete: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        execute: jest.fn(async () => undefined)
    }
    query.delete.mockReturnValue(query)
    query.where.mockReturnValue(query)
    query.andWhere.mockReturnValue(query)
    return query
}

describe('GraphRAG service', () => {
    it('normalizes entity names and types with stable explicit keys', () => {
        expect(normalizeKnowledgeGraphName('  OpenAI   Platform  ')).toBe('openai platform')
        expect(normalizeKnowledgeGraphType('Product Area')).toBe('product_area')
    })

    it('does not enqueue graph jobs when GraphRAG is disabled', async () => {
        const knowledgebaseService = {
            findOne: jest.fn(async () => ({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                graphRag: {
                    enabled: false
                }
            }))
        }
        const queue = {
            add: jest.fn()
        }
        const jobRepository = {
            create: jest.fn(),
            save: jest.fn()
        }
        const knowledgebaseRepository = {
            update: jest.fn()
        }
        const service = new GraphragService(
            repositoryMock<KnowledgeGraphEntity>(),
            repositoryMock<KnowledgeGraphRelation>(),
            repositoryMock<KnowledgeGraphMention>(),
            repositoryMock<KnowledgeGraphCommunity>(),
            jobRepository as unknown as Repository<KnowledgeGraphIndexJob>,
            knowledgebaseRepository as unknown as Repository<Knowledgebase>,
            knowledgebaseService as unknown as KnowledgebaseService,
            {} as unknown as KnowledgeDocumentService,
            {} as unknown as KnowledgeDocumentChunkService,
            { execute: jest.fn() } as unknown as QueryBus,
            queue as unknown as Queue<TKnowledgeGraphIndexQueueJob>
        )

        const jobs = await service.enqueueDocuments({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            knowledgebaseId: 'kb-1',
            documentIds: ['doc-1'],
            reason: 'document'
        })

        expect(jobs).toEqual([])
        expect(jobRepository.save).not.toHaveBeenCalled()
        expect(knowledgebaseRepository.update).not.toHaveBeenCalled()
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('creates manual graph entities and syncs active entity vectors', async () => {
        const entityVectorQuery = {
            where: jest.fn(),
            andWhere: jest.fn(),
            orderBy: jest.fn(),
            getMany: jest.fn(async () => [])
        }
        entityVectorQuery.where.mockReturnValue(entityVectorQuery)
        entityVectorQuery.andWhere.mockReturnValue(entityVectorQuery)
        entityVectorQuery.orderBy.mockReturnValue(entityVectorQuery)

        const entityRepository = {
            findOne: jest.fn(async () => null),
            create: jest.fn(
                (input: Partial<KnowledgeGraphEntity>) => ({ id: 'entity-1', ...input }) as KnowledgeGraphEntity
            ),
            save: jest.fn(async (entity: KnowledgeGraphEntity) => ({ ...entity, id: entity.id ?? 'entity-1' })),
            createQueryBuilder: jest.fn(() => entityVectorQuery)
        }
        const vectorStore = {
            clear: jest.fn(async () => undefined),
            addGraphDocuments: jest.fn(async () => undefined)
        }
        const knowledgebaseService = {
            findOne: jest.fn(async () => enabledKnowledgebase()),
            getGraphEntityVectorStore: jest.fn(async () => vectorStore)
        }
        const service = new GraphragService(
            entityRepository as unknown as Repository<KnowledgeGraphEntity>,
            repositoryMock<KnowledgeGraphRelation>(),
            repositoryMock<KnowledgeGraphMention>(),
            repositoryMock<KnowledgeGraphCommunity>(),
            repositoryMock<KnowledgeGraphIndexJob>(),
            repositoryMock<Knowledgebase>(),
            knowledgebaseService as unknown as KnowledgebaseService,
            {} as unknown as KnowledgeDocumentService,
            {} as unknown as KnowledgeDocumentChunkService,
            { execute: jest.fn() } as unknown as QueryBus,
            { add: jest.fn() } as unknown as Queue<TKnowledgeGraphIndexQueueJob>
        )

        const entity = await service.createEntity('kb-1', {
            name: 'OpenAI Platform',
            type: 'Product Area',
            aliases: ['Platform'],
            description: 'Developer platform'
        })

        expect(entity.origin).toBe('manual')
        expect(entity.visibility).toBe('active')
        expect(entity.type).toBe('product_area')
        expect(entity.normalizedName).toBe('openai platform')
        expect(vectorStore.clear).toHaveBeenCalled()
    })

    it('hides entities as curated rows and hides incident relations', async () => {
        const entityVectorQuery = {
            where: jest.fn(),
            andWhere: jest.fn(),
            orderBy: jest.fn(),
            getMany: jest.fn(async () => [])
        }
        entityVectorQuery.where.mockReturnValue(entityVectorQuery)
        entityVectorQuery.andWhere.mockReturnValue(entityVectorQuery)
        entityVectorQuery.orderBy.mockReturnValue(entityVectorQuery)

        const relationUpdateQuery = {
            update: jest.fn(),
            set: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            execute: jest.fn(async () => undefined)
        }
        relationUpdateQuery.update.mockReturnValue(relationUpdateQuery)
        relationUpdateQuery.set.mockReturnValue(relationUpdateQuery)
        relationUpdateQuery.where.mockReturnValue(relationUpdateQuery)
        relationUpdateQuery.andWhere.mockReturnValue(relationUpdateQuery)

        const entityRepository = {
            findOne: jest.fn(async () => ({
                id: 'entity-1',
                knowledgebaseId: 'kb-1',
                name: 'OpenAI',
                normalizedName: 'openai',
                type: 'organization',
                origin: 'extracted',
                visibility: 'active'
            })),
            save: jest.fn(async (entity: KnowledgeGraphEntity) => entity),
            createQueryBuilder: jest.fn(() => entityVectorQuery)
        }
        const vectorStore = {
            clear: jest.fn(async () => undefined),
            addGraphDocuments: jest.fn(async () => undefined)
        }
        const knowledgebaseService = {
            findOne: jest.fn(async () => enabledKnowledgebase()),
            getGraphEntityVectorStore: jest.fn(async () => vectorStore)
        }
        const relationRepository = {
            createQueryBuilder: jest.fn(() => relationUpdateQuery)
        }
        const service = new GraphragService(
            entityRepository as unknown as Repository<KnowledgeGraphEntity>,
            relationRepository as unknown as Repository<KnowledgeGraphRelation>,
            repositoryMock<KnowledgeGraphMention>(),
            repositoryMock<KnowledgeGraphCommunity>(),
            repositoryMock<KnowledgeGraphIndexJob>(),
            repositoryMock<Knowledgebase>(),
            knowledgebaseService as unknown as KnowledgebaseService,
            {} as unknown as KnowledgeDocumentService,
            {} as unknown as KnowledgeDocumentChunkService,
            { execute: jest.fn() } as unknown as QueryBus,
            { add: jest.fn() } as unknown as Queue<TKnowledgeGraphIndexQueueJob>
        )

        const entity = await service.hideEntity('kb-1', 'entity-1')

        expect(entity.origin).toBe('curated')
        expect(entity.visibility).toBe('hidden')
        expect(relationUpdateQuery.set).toHaveBeenCalledWith({ visibility: 'hidden' })
        expect(vectorStore.clear).toHaveBeenCalled()
    })

    it('preserves extracted entity endpoints that are referenced by manual or hidden relations during rebuild cleanup', async () => {
        const relationDeleteQuery = deleteQueryBuilderMock()
        const entityDeleteQuery = deleteQueryBuilderMock()
        const vectorStore = {
            clear: jest.fn(async () => undefined)
        }
        const relationRepository = {
            createQueryBuilder: jest.fn(() => relationDeleteQuery),
            find: jest.fn(async () => [
                {
                    sourceEntityId: 'entity-source',
                    targetEntityId: 'entity-target'
                },
                {
                    sourceEntityId: 'entity-source',
                    targetEntityId: null
                }
            ]),
            update: jest.fn()
        }
        const entityRepository = {
            createQueryBuilder: jest.fn(() => entityDeleteQuery),
            update: jest.fn()
        }
        const service = new GraphragService(
            entityRepository as unknown as Repository<KnowledgeGraphEntity>,
            relationRepository as unknown as Repository<KnowledgeGraphRelation>,
            { delete: jest.fn() } as unknown as Repository<KnowledgeGraphMention>,
            { delete: jest.fn() } as unknown as Repository<KnowledgeGraphCommunity>,
            { delete: jest.fn() } as unknown as Repository<KnowledgeGraphIndexJob>,
            repositoryMock<Knowledgebase>(),
            {
                getGraphEntityVectorStore: jest.fn(async () => vectorStore)
            } as unknown as KnowledgebaseService,
            {} as unknown as KnowledgeDocumentService,
            {} as unknown as KnowledgeDocumentChunkService,
            { execute: jest.fn() } as unknown as QueryBus,
            { add: jest.fn() } as unknown as Queue<TKnowledgeGraphIndexQueueJob>
        )

        await service.clearKnowledgebase('kb-1')

        expect(entityDeleteQuery.andWhere).toHaveBeenCalledWith('id NOT IN (:...preservedEndpointIds)', {
            preservedEndpointIds: ['entity-source', 'entity-target']
        })
        expect(vectorStore.clear).toHaveBeenCalled()
    })
})
