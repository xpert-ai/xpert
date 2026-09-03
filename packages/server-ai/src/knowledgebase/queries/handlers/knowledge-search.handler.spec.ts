import { DocumentInterface } from '@langchain/core/documents'
import { QueryBus } from '@nestjs/cqrs'
import { DocumentMetadata, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery } from '../knowledge-search.query'
import { KnowledgeGraphSearchQuery } from '../../../graphrag/queries'
import { KnowledgeDocumentChunkService } from '../../../knowledge-document/chunk/chunk.service'
import {
    GraphKnowledgeCandidateRetriever,
    KnowledgeRetrievalBatch,
    LegacyWeightedFusion,
    VectorKnowledgeCandidateRetriever
} from '../../retrieval'
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

function createDiagnostics() {
    return { filterVersion: 2 as const, filterStatus: 'not_applied' as const, hitCount: 0 }
}

function vectorBatch(
    documents: DocumentInterface<DocumentMetadata>[],
    diagnostics: KnowledgeRetrievalBatch['diagnostics'] = createDiagnostics()
): KnowledgeRetrievalBatch {
    return {
        source: 'vector',
        candidates: documents.map((document, index) => ({ document, rank: index + 1 })),
        diagnostics
    }
}

function createHandler(
    knowledgebaseService: KnowledgebaseService,
    queryBus: QueryBus,
    chunkService: KnowledgeDocumentChunkService = {
        findAll: jest.fn(async () => ({ items: [] }))
    } as unknown as KnowledgeDocumentChunkService
) {
    const vectorRetriever = new VectorKnowledgeCandidateRetriever(knowledgebaseService, chunkService)
    const graphRetriever = new GraphKnowledgeCandidateRetriever(queryBus)
    const handler = new KnowledgeSearchQueryHandler(
        knowledgebaseService,
        vectorRetriever,
        graphRetriever,
        new LegacyWeightedFusion()
    )
    Object.defineProperty(handler, 'retrievalLogService', { value: { create: jest.fn() } })
    return { handler, vectorRetriever }
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
        const { handler, vectorRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn() } as unknown as QueryBus
        )
        const vectorSearch = jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([]))

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
            expect.objectContaining({
                knowledgebase,
                query: 'quality requirements',
                k: undefined,
                modelContext: {
                    xpertId: 'xpert-1',
                    threadId: 'thread-1'
                }
            })
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
        const { handler, vectorRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const vectorSearch = jest.spyOn(vectorRetriever, 'retrieve')

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
        const { handler, vectorRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(
            vectorBatch([chunk('chunk-1', { score: 0.8 }), chunk('chunk-2', { score: 0.6 })])
        )

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
        const { handler, vectorRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(
            vectorBatch([chunk('filtered-vector', { score: 0.8 })], {
                filterVersion: 2,
                filterStatus: 'applied',
                hitCount: 1
            })
        )

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

    it('fails graph-only retrieval when graph search fails', async () => {
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
        const { handler } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            {
                execute: jest.fn(async () => ({ docs: [], failed: true, error: 'graph backend unavailable' }))
            } as unknown as QueryBus
        )

        await expect(
            handler.execute(
                new KnowledgeSearchQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebases: ['kb-1'],
                    query: 'who owns the platform?',
                    source: 'spec',
                    retrieval: { mode: 'graph' }
                })
            )
        ).rejects.toThrow('graph backend unavailable')
    })

    it('does not renormalize vector weight when graph retrieval succeeds without hits', async () => {
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
        const { handler, vectorRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn(async () => ({ docs: [] })) } as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([chunk('vector-only', { score: 0.8 })]))

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'who owns the platform?',
                source: 'spec',
                retrieval: { mode: 'hybrid' }
            })
        )

        expect(result.documents).toHaveLength(1)
        expect(result.documents[0].metadata).toEqual(
            expect.objectContaining({
                vectorScore: 0.8,
                graphScore: 0
            })
        )
        expect(result.documents[0].metadata.score).toBeCloseTo(0.6)
        expect(result.documents[0].metadata.relevanceScore).toBeCloseTo(0.6)
    })

    it('reranks the vector branch and the fused results in hybrid mode', async () => {
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async () => ({
                items: [[chunk('vector-1'), 0.2]],
                candidateDocumentCount: 1,
                candidateChunkCount: 1
            })),
            rerank: jest.fn(async (documents: DocumentInterface<DocumentMetadata>[]) =>
                documents.map((_document, index) => ({ index, relevanceScore: 0.9 - index * 0.1 }))
            )
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        name: 'Knowledgebase',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5 },
                        rerankModelId: 'rerank-model',
                        graphRag: { enabled: true, graphWeight: 0.25 }
                    }
                ]
            })),
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const { handler } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            {
                execute: jest.fn(async () => ({
                    docs: [chunk('graph-1', { graphScore: 0.7, score: 0.7 })]
                }))
            } as unknown as QueryBus,
            {
                findAll: jest.fn(async () => ({
                    items: [
                        {
                            id: 'chunk-row-1',
                            pageContent: 'content-vector-1',
                            metadata: { chunkId: 'vector-1' },
                            document: { id: 'document-1', disabled: false }
                        }
                    ]
                }))
            } as unknown as KnowledgeDocumentChunkService
        )

        await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'who owns the platform?',
                source: 'spec',
                retrieval: { mode: 'hybrid' }
            })
        )

        expect(vectorStore.rerank).toHaveBeenCalledTimes(2)
        expect(vectorStore.rerank.mock.calls[0][0]).toHaveLength(1)
        expect(vectorStore.rerank.mock.calls[1][0]).toHaveLength(2)
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
        const { handler, vectorRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const vectorSearch = jest
            .spyOn(vectorRetriever, 'retrieve')
            .mockResolvedValue(vectorBatch([chunk('chunk-1', { score: 0.8 })]))

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
        const { handler } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )

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
        const { handler, vectorRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn() } as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(
            vectorBatch([chunk('chunk-1', { score: 0.7, relevanceScore: 0.95 })], {
                filterVersion: 2,
                filterStatus: 'applied',
                dynamicFilter: {
                    kind: 'condition',
                    field: 'document.fileExtension',
                    operator: 'eq',
                    value: { kind: 'literal', value: 'pdf' }
                },
                hitCount: 1
            })
        )

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
