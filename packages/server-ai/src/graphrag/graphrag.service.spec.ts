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
})
