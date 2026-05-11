import { DocumentInterface } from '@langchain/core/documents'
import { QueryBus } from '@nestjs/cqrs'
import { DocumentMetadata, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery } from '../knowledge-search.query'
import { KnowledgeGraphSearchQuery } from '../../../graphrag/queries'
import { KnowledgeSearchQueryHandler } from './knowledge-search.handler'

function chunk(chunkId: string, metadata: Partial<DocumentMetadata> = {}): DocumentInterface<DocumentMetadata> {
    return {
        pageContent: `content-${chunkId}`,
        metadata: {
            ...metadata,
            chunkId
        }
    }
}

describe('KnowledgeSearchQueryHandler GraphRAG modes', () => {
    it('routes graph mode to graph search without vector search', async () => {
        const graphDocs = [chunk('graph-1', { graphScore: 0.9, score: 0.9 })]
        const queryBus = {
            execute: jest.fn(async () => ({ docs: graphDocs }))
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5 },
                        graphRag: { enabled: true }
                    }
                ]
            }))
        }
        const handler = new KnowledgeSearchQueryHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const vectorSearch = jest.spyOn(handler, 'similaritySearchWithScore')

        const results = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'who owns the platform?',
                source: 'spec',
                retrieval: {
                    mode: 'graph'
                }
            })
        )

        expect(vectorSearch).not.toHaveBeenCalled()
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(KnowledgeGraphSearchQuery))
        expect(results).toEqual(graphDocs)
    })

    it('deduplicates and fuses vector and graph chunks in hybrid mode', async () => {
        const queryBus = {
            execute: jest.fn(async () => ({
                docs: [
                    chunk('chunk-1', { graphScore: 0.4, score: 0.4, matchedEntities: ['entity-1'] }),
                    chunk('chunk-3', { graphScore: 0.9, score: 0.9, matchedEntities: ['entity-3'] })
                ]
            }))
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5 },
                        graphRag: { enabled: true, graphWeight: 0.25 }
                    }
                ]
            }))
        }
        const handler = new KnowledgeSearchQueryHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        jest.spyOn(handler, 'similaritySearchWithScore').mockResolvedValue([
            chunk('chunk-1', { score: 0.8 }),
            chunk('chunk-2', { score: 0.6 })
        ])

        const results = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'who owns the platform?',
                source: 'spec',
                retrieval: {
                    mode: 'hybrid',
                    graphWeight: 0.25
                }
            })
        )

        expect(results.map((doc) => doc.metadata.chunkId)).toEqual(['chunk-1', 'chunk-2', 'chunk-3'])
        expect(results[0].metadata).toEqual(
            expect.objectContaining({
                vectorScore: 0.8,
                graphScore: 0.4,
                matchedEntities: ['entity-1']
            })
        )
        expect(results[0].metadata.score).toBeCloseTo(0.7)
        expect(results[1].metadata).toEqual(
            expect.objectContaining({
                vectorScore: 0.6,
                graphScore: 0
            })
        )
        expect(results[1].metadata.score).toBeCloseTo(0.45)
    })
})
