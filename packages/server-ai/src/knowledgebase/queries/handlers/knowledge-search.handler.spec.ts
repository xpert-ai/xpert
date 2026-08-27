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

const diagnostics = { filterVersion: 2 as const, filterStatus: 'not_applied' as const, hitCount: 0 }

function attachHandlerServices(handler: KnowledgeSearchQueryHandler) {
    const service = (handler as unknown as { knowledgebaseService: KnowledgebaseService }).knowledgebaseService
    if (!service.findOne && service.findAll) {
        service.findOne = jest.fn(async (id: string) => {
            const result = await service.findAll()
            return result.items.find((item) => item.id === id)
        }) as KnowledgebaseService['findOne']
    }
    Object.defineProperty(handler, 'retrievalLogService', { value: { create: jest.fn() } })
    Object.defineProperty(handler, 'chunkService', { value: { findAll: jest.fn(async () => ({ items: [] })) } })
}

describe('KnowledgeSearchQueryHandler GraphRAG modes', () => {
    it('passes Xpert billing context to vector retrieval', async () => {
        const knowledgebase = {
            id: 'kb-1',
            type: KnowledgebaseTypeEnum.Standard,
            recall: { topK: 5 }
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({ items: [knowledgebase] }))
        }
        const handler = new KnowledgeSearchQueryHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn() } as unknown as QueryBus
        )
        attachHandlerServices(handler)
        const vectorSearch = jest
            .spyOn(handler, 'similaritySearchWithScore')
            .mockResolvedValue({ documents: [], diagnostics })

        await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'quality requirements',
                source: 'retriever',
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            })
        )

        expect(vectorSearch).toHaveBeenCalledWith(
            knowledgebase,
            'quality requirements',
            undefined,
            expect.any(Object),
            false,
            {
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            }
        )
    })

    it('routes graph mode to graph search without vector search', async () => {
        const graphDocs = [chunk('graph-1', { graphScore: 0.9, score: 0.9 })]
        const queryBus = {
            execute: jest.fn().mockResolvedValue({ docs: graphDocs })
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
        attachHandlerServices(handler)
        const vectorSearch = jest.spyOn(handler, 'similaritySearchWithScore')

        const results = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'who owns the platform?',
                source: 'spec',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                retrieval: {
                    mode: 'graph'
                }
            })
        )

        expect(vectorSearch).not.toHaveBeenCalled()
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(KnowledgeGraphSearchQuery))
        const graphQuery = queryBus.execute.mock.calls[0]?.[0]
        expect(graphQuery).toBeInstanceOf(KnowledgeGraphSearchQuery)
        if (!(graphQuery instanceof KnowledgeGraphSearchQuery)) {
            throw new Error('Expected knowledge graph search query')
        }
        expect(graphQuery.input).toEqual(expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' }))
        expect(results.documents).toEqual(graphDocs)
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
        attachHandlerServices(handler)
        jest.spyOn(handler, 'similaritySearchWithScore').mockResolvedValue({
            documents: [chunk('chunk-1', { score: 0.8 }), chunk('chunk-2', { score: 0.6 })],
            diagnostics
        })

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

        expect(results.documents.map((doc) => doc.metadata.chunkId)).toEqual(['chunk-1', 'chunk-2', 'chunk-3'])
        expect(results.documents[0].metadata).toEqual(
            expect.objectContaining({
                vectorScore: 0.8,
                graphScore: 0.4,
                matchedEntities: ['entity-1']
            })
        )
        expect(results.documents[0].metadata.score).toBeCloseTo(0.7)
        expect(results.documents[1].metadata).toEqual(
            expect.objectContaining({
                vectorScore: 0.6,
                graphScore: 0
            })
        )
        expect(results.documents[1].metadata.score).toBeCloseTo(0.45)
    })

    it('falls back only to the filtered vector branch when graph fails in hybrid mode', async () => {
        const queryBus = {
            execute: jest.fn(async () => ({ docs: [], failed: true, error: 'scoped graph query failed' }))
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
        attachHandlerServices(handler)
        jest.spyOn(handler, 'similaritySearchWithScore').mockResolvedValue({
            documents: [chunk('filtered-vector', { score: 0.8 })],
            diagnostics: { filterVersion: 2, filterStatus: 'applied', hitCount: 1 }
        })

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: '水利定额',
                source: 'spec',
                filters: {
                    request: {
                        kind: 'condition',
                        field: 'document.folderPath',
                        operator: 'under',
                        value: { kind: 'literal', value: '水利' }
                    }
                },
                retrieval: { mode: 'hybrid' }
            })
        )

        expect(result.documents.map((doc) => doc.metadata.chunkId)).toEqual(['filtered-vector'])
        expect(result.diagnostics[0]).toMatchObject({
            filterStatus: 'applied',
            vectorBranchHitCount: 1,
            graphBranchHitCount: 0,
            hybridGraphFallbackReason: 'scoped graph query failed'
        })
    })

    it('uses the knowledgebase retrieval mode when the request does not override it', async () => {
        const queryBus = {
            execute: jest.fn(async () => ({
                docs: [chunk('graph-1', { graphScore: 0.9, score: 0.9 })]
            }))
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5 },
                        graphRag: { enabled: true, mode: 'hybrid', graphWeight: 0.25 }
                    }
                ]
            }))
        }
        const handler = new KnowledgeSearchQueryHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        attachHandlerServices(handler)
        const vectorSearch = jest
            .spyOn(handler, 'similaritySearchWithScore')
            .mockResolvedValue({ documents: [chunk('chunk-1', { score: 0.8 })], diagnostics })

        const results = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'who owns the platform?',
                source: 'spec'
            })
        )

        expect(vectorSearch).toHaveBeenCalled()
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(KnowledgeGraphSearchQuery))
        expect(results.documents.map((doc) => doc.metadata.chunkId)).toEqual(['chunk-1', 'graph-1'])
    })

    it('passes Knowledge Filter V2 scope to graph mode', async () => {
        const queryBus = {
            execute: jest.fn(async () => ({ docs: [chunk('graph-filtered', { graphScore: 0.9, score: 0.9 })] }))
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: {},
                        graphRag: { enabled: true }
                    }
                ]
            }))
        }
        const handler = new KnowledgeSearchQueryHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        attachHandlerServices(handler)

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'YBX4 180M2 22kW',
                source: 'spec',
                retrieval: {
                    mode: 'graph',
                    filtering: {
                        fixed: {
                            kind: 'condition',
                            field: 'document.folderPath',
                            operator: 'under',
                            value: { kind: 'literal', value: '水利/华东' }
                        },
                        agent: { enabled: true }
                    }
                }
            })
        )
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    filterScope: expect.objectContaining({
                        tenantId: 'tenant-1',
                        organizationId: 'org-1',
                        knowledgebaseId: 'kb-1',
                        compiledPostgres: expect.objectContaining({ parameters: ['水利/华东', '水利/华东/%'] })
                    })
                })
            })
        )
        expect(result.documents.map((doc) => doc.metadata.chunkId)).toEqual(['graph-filtered'])
    })

    it('reports zero final hits after the score threshold and allows an Agent-controlled retry', async () => {
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5 },
                        metadataSchema: []
                    }
                ]
            }))
        }
        const handler = new KnowledgeSearchQueryHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn() } as unknown as QueryBus
        )
        attachHandlerServices(handler)
        jest.spyOn(handler, 'similaritySearchWithScore').mockResolvedValue({
            documents: [chunk('chunk-1', { score: 0.7 })],
            diagnostics: {
                filterVersion: 2,
                filterStatus: 'applied',
                dynamicFilter: {
                    kind: 'condition',
                    field: 'document.fileExtension',
                    operator: 'eq',
                    value: { kind: 'literal', value: 'pdf' }
                },
                hitCount: 1
            }
        })

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: '2025 定额',
                score: 0.8,
                source: 'spec',
                filters: {
                    dynamic: {
                        kind: 'condition',
                        field: 'document.fileExtension',
                        operator: 'eq',
                        value: { kind: 'literal', value: 'pdf' }
                    }
                }
            })
        )

        expect(result.documents).toHaveLength(0)
        expect(result.diagnostics[0]).toMatchObject({
            hitCount: 0,
            retryableWithoutDynamic: true
        })
    })
})
