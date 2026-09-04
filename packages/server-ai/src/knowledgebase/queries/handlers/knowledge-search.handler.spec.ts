import { DocumentInterface } from '@langchain/core/documents'
import { QueryBus } from '@nestjs/cqrs'
import { DocumentMetadata, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery } from '../knowledge-search.query'
import { KnowledgeGraphSearchQuery } from '../../../graphrag/queries'
import { KnowledgeDocumentChunkService } from '../../../knowledge-document/chunk/chunk.service'
import { DataSource } from 'typeorm'
import {
    GraphKnowledgeCandidateRetriever,
    KeywordKnowledgeCandidateRetriever,
    KnowledgeKeywordIndexService,
    KnowledgeRetrievalBatch,
    LegacyWeightedFusion,
    VectorKnowledgeCandidateRetriever,
    WeightedRrfFusion
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

function keywordBatch(
    documents: DocumentInterface<DocumentMetadata>[],
    diagnostics: KnowledgeRetrievalBatch['diagnostics'] = createDiagnostics()
): KnowledgeRetrievalBatch {
    return {
        source: 'keyword',
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
    const keywordDataSource = {
        options: { type: 'postgres' },
        query: jest.fn(async () => [])
    } as unknown as DataSource
    const keywordIndexDataSource = {
        options: { type: 'postgres' },
        query: jest.fn(async () => [{ fullTextReady: true, trigramReady: true, documentNameTrigramReady: true }])
    } as unknown as DataSource
    const keywordRetriever = new KeywordKnowledgeCandidateRetriever(
        keywordDataSource,
        new KnowledgeKeywordIndexService(keywordIndexDataSource)
    )
    const handler = new KnowledgeSearchQueryHandler(
        knowledgebaseService,
        vectorRetriever,
        graphRetriever,
        keywordRetriever,
        new LegacyWeightedFusion(),
        new WeightedRrfFusion()
    )
    const retrievalLogService = { create: jest.fn() }
    Object.defineProperty(handler, 'retrievalLogService', { value: retrievalLogService })
    return { handler, vectorRetriever, keywordRetriever, retrievalLogService }
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

    it('routes keyword mode to keyword retrieval without vector or graph search', async () => {
        const keywordDocs = [chunk('keyword-1', { keywordScore: 8, score: 8 })]
        const queryBus = { execute: jest.fn() }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5, score: 100 }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const vectorSearch = jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([]))
        const keywordSearch = jest.spyOn(keywordRetriever, 'retrieve').mockResolvedValue(
            keywordBatch(keywordDocs, {
                ...createDiagnostics(),
                keywordIndexStatus: 'ready',
                keywordCandidateCount: 1
            })
        )

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'LSJWR4095RS105767',
                source: 'spec',
                retrieval: {
                    mode: 'keyword'
                }
            })
        )

        expect(vectorSearch).not.toHaveBeenCalled()
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(keywordSearch).toHaveBeenCalledTimes(1)
        expect(result.documents).toEqual(keywordDocs)
        expect(result.diagnostics[0]).toEqual(
            expect.objectContaining({
                keywordIndexStatus: 'ready',
                keywordCandidateCount: 1,
                keywordBranchHitCount: 1,
                hitCount: 1
            })
        )
    })

    it('preserves a missing-index failure when keyword mode runs alone', async () => {
        const queryBus = { execute: jest.fn() }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5 }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever, retrievalLogService } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const vectorSearch = jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([]))
        jest.spyOn(keywordRetriever, 'retrieve').mockResolvedValue({
            ...keywordBatch([]),
            diagnostics: {
                ...createDiagnostics(),
                keywordIndexStatus: 'missing',
                keywordCandidateCount: 0,
                keywordFailureReason: 'knowledge keyword indexes are missing',
                errors: ['knowledge keyword indexes are missing']
            },
            failed: true,
            error: 'knowledge keyword indexes are missing'
        })

        await expect(
            handler.execute(
                new KnowledgeSearchQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebases: ['kb-1'],
                    query: 'LSJWR4095RS105767',
                    source: 'spec',
                    retrieval: {
                        mode: 'keyword'
                    }
                })
            )
        ).rejects.toThrow('knowledge keyword indexes are missing')

        expect(vectorSearch).not.toHaveBeenCalled()
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(retrievalLogService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                errorCode: 'keyword_index_missing',
                diagnostics: expect.objectContaining({
                    filterStatus: 'failed',
                    errorCode: 'keyword_index_missing',
                    keywordIndexStatus: 'missing',
                    keywordFailureReason: 'knowledge keyword indexes are missing'
                })
            })
        )
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
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const keywordSearch = jest.spyOn(keywordRetriever, 'retrieve')
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
        expect(keywordSearch).not.toHaveBeenCalled()
    })

    it('uses explicit weighted RRF configuration to fuse vector, graph and keyword branches', async () => {
        const queryBus = {
            execute: jest.fn(async () => ({
                docs: [chunk('graph-only', { graphScore: 0.9 }), chunk('shared', { graphScore: 0.8 })]
            }))
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: {
                            topK: 5,
                            score: 0.9,
                            fusion: {
                                mode: 'weighted_rrf',
                                rankConstant: 0,
                                weights: { vector: 1, graph: 1, keyword: 1 }
                            }
                        },
                        graphRag: { enabled: true, mode: 'hybrid' }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const vectorSearch = jest
            .spyOn(vectorRetriever, 'retrieve')
            .mockResolvedValue(vectorBatch([chunk('shared', { score: 0.9 }), chunk('vector-only', { score: 0.8 })]))
        const keywordSearch = jest
            .spyOn(keywordRetriever, 'retrieve')
            .mockResolvedValue(
                keywordBatch([
                    chunk('shared', { keywordScore: 7, score: 7 }),
                    chunk('keyword-only', { keywordScore: 4, score: 4 })
                ])
            )

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'LSJWR4095RS105767',
                source: 'spec'
            })
        )

        expect(vectorSearch).toHaveBeenCalledTimes(1)
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(KnowledgeGraphSearchQuery))
        expect(keywordSearch).toHaveBeenCalledTimes(1)
        expect(result.documents.map((document) => document.metadata.chunkId)).toEqual([
            'shared',
            'graph-only',
            'keyword-only',
            'vector-only'
        ])
        expect(result.documents[0].metadata.rrfScore).toBeCloseTo(2.5)
        expect(result.diagnostics[0]).toEqual(
            expect.objectContaining({
                fusionMode: 'weighted_rrf',
                vectorBranchHitCount: 2,
                graphBranchHitCount: 2,
                keywordBranchHitCount: 2,
                hitCount: 4
            })
        )
    })

    it('lets request-level RRF settings override the knowledgebase legacy default', async () => {
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: {
                            topK: 5,
                            fusion: {
                                mode: 'legacy',
                                rankConstant: 0,
                                weights: { vector: 0.1, graph: 0, keyword: 1 }
                            }
                        },
                        graphRag: { enabled: true, mode: 'hybrid' }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn(async () => ({ docs: [] })) } as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([chunk('vector', { score: 0.8 })]))
        const keywordSearch = jest
            .spyOn(keywordRetriever, 'retrieve')
            .mockResolvedValue(keywordBatch([chunk('keyword', { keywordScore: 3 })]))

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'exact keyword',
                source: 'spec',
                retrieval: {
                    mode: 'hybrid',
                    fusion: { mode: 'weighted_rrf' }
                }
            })
        )

        expect(keywordSearch).toHaveBeenCalledTimes(1)
        expect(result.documents.map((document) => document.metadata.chunkId)).toEqual(['keyword', 'vector'])
    })

    it('lets a request explicitly keep legacy fusion when the knowledgebase enables RRF', async () => {
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5, fusion: { mode: 'weighted_rrf' } },
                        graphRag: { enabled: true, mode: 'hybrid', graphWeight: 0.25 }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            {
                execute: jest.fn(async () => ({ docs: [chunk('graph', { graphScore: 0.8, score: 0.8 })] }))
            } as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([chunk('vector', { score: 0.8 })]))
        const keywordSearch = jest.spyOn(keywordRetriever, 'retrieve')

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'exact keyword',
                source: 'spec',
                retrieval: {
                    mode: 'hybrid',
                    fusion: { mode: 'legacy' }
                }
            })
        )

        expect(keywordSearch).not.toHaveBeenCalled()
        expect(result.documents.map((document) => document.metadata.chunkId)).toEqual(['vector', 'graph'])
        expect(result.diagnostics[0].fusionMode).not.toBe('weighted_rrf')
    })

    it('fails explicit RRF retrieval instead of silently fusing a failed graph branch', async () => {
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5, fusion: { mode: 'weighted_rrf' } },
                        graphRag: { enabled: true, mode: 'hybrid' }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            {
                execute: jest.fn(async () => ({ docs: [], failed: true, error: 'graph backend unavailable' }))
            } as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([chunk('vector', { score: 0.8 })]))
        jest.spyOn(keywordRetriever, 'retrieve').mockResolvedValue(keywordBatch([]))

        await expect(
            handler.execute(
                new KnowledgeSearchQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebases: ['kb-1'],
                    query: 'exact keyword',
                    source: 'spec'
                })
            )
        ).rejects.toBeInstanceOf(Error)
    })

    it('fails explicit RRF retrieval when the keyword branch reports a missing index', async () => {
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5, fusion: { mode: 'weighted_rrf' } },
                        graphRag: { enabled: true, mode: 'hybrid' }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever, retrievalLogService } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn(async () => ({ docs: [] })) } as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([]))
        jest.spyOn(keywordRetriever, 'retrieve').mockResolvedValue({
            ...keywordBatch([]),
            diagnostics: {
                ...createDiagnostics(),
                keywordIndexStatus: 'missing',
                keywordCandidateCount: 0,
                keywordBranchHitCount: 0,
                keywordFailureReason: 'knowledge keyword indexes are missing',
                errors: ['knowledge keyword indexes are missing']
            },
            failed: true,
            error: 'knowledge keyword indexes are missing'
        })

        await expect(
            handler.execute(
                new KnowledgeSearchQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebases: ['kb-1'],
                    query: 'exact keyword',
                    source: 'spec'
                })
            )
        ).rejects.toThrow('Cannot fuse failed RRF batch for source: keyword: knowledge keyword indexes are missing')

        expect(retrievalLogService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                errorCode: 'keyword_index_missing',
                diagnostics: expect.objectContaining({
                    filterStatus: 'failed',
                    errorCode: 'keyword_index_missing',
                    keywordIndexStatus: 'missing',
                    keywordFailureReason: 'knowledge keyword indexes are missing'
                })
            })
        )
    })

    it('preserves keyword query failure diagnostics in the failed retrieval log', async () => {
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5, fusion: { mode: 'weighted_rrf' } },
                        graphRag: { enabled: true, mode: 'hybrid' }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever, retrievalLogService } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn(async () => ({ docs: [] })) } as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([]))
        jest.spyOn(keywordRetriever, 'retrieve').mockResolvedValue({
            ...keywordBatch([]),
            diagnostics: {
                ...createDiagnostics(),
                keywordIndexStatus: 'ready',
                keywordCandidateCount: 0,
                keywordBranchHitCount: 0,
                keywordFailureReason: 'keyword database unavailable',
                errors: ['keyword database unavailable']
            },
            failed: true,
            error: 'keyword database unavailable'
        })

        await expect(
            handler.execute(
                new KnowledgeSearchQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebases: ['kb-1'],
                    query: 'exact keyword',
                    source: 'spec'
                })
            )
        ).rejects.toThrow('keyword database unavailable')

        expect(retrievalLogService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                errorCode: 'keyword_query_failed',
                diagnostics: expect.objectContaining({
                    filterStatus: 'failed',
                    errorCode: 'keyword_query_failed',
                    keywordIndexStatus: 'ready',
                    keywordFailureReason: 'keyword database unavailable'
                })
            })
        )
    })

    it('does not execute RRF branches whose configured weight is zero', async () => {
        const queryBus = {
            execute: jest.fn(async () => ({ docs: [], failed: true, error: 'graph backend unavailable' }))
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: {
                            topK: 5,
                            fusion: {
                                mode: 'weighted_rrf',
                                weights: { vector: 1, graph: 0, keyword: 0 }
                            }
                        },
                        graphRag: { enabled: true, mode: 'hybrid' }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const vectorSearch = jest
            .spyOn(vectorRetriever, 'retrieve')
            .mockResolvedValue(vectorBatch([chunk('vector', { score: 0.8 })]))
        const keywordSearch = jest.spyOn(keywordRetriever, 'retrieve').mockResolvedValue({
            ...keywordBatch([]),
            failed: true,
            error: 'knowledge keyword indexes are missing'
        })

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'exact keyword',
                source: 'spec'
            })
        )

        expect(vectorSearch).toHaveBeenCalledTimes(1)
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(keywordSearch).not.toHaveBeenCalled()
        expect(result.documents.map((document) => document.metadata.chunkId)).toEqual(['vector'])
        expect(result.diagnostics[0]).toEqual(
            expect.objectContaining({
                vectorBranchHitCount: 1,
                graphBranchHitCount: 0,
                keywordBranchHitCount: 0,
                fusionMode: 'weighted_rrf'
            })
        )
    })

    it('rejects an all-zero RRF configuration before executing any retrieval branch', async () => {
        const queryBus = { execute: jest.fn(async () => ({ docs: [] })) }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: {
                            topK: 5,
                            fusion: {
                                mode: 'weighted_rrf',
                                weights: { vector: 0, graph: 0, keyword: 0 }
                            }
                        },
                        graphRag: { enabled: true, mode: 'hybrid' }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            queryBus as unknown as QueryBus
        )
        const vectorSearch = jest.spyOn(vectorRetriever, 'retrieve')
        const keywordSearch = jest.spyOn(keywordRetriever, 'retrieve')

        await expect(
            handler.execute(
                new KnowledgeSearchQuery({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebases: ['kb-1'],
                    query: 'exact keyword',
                    source: 'spec'
                })
            )
        ).rejects.toThrow('RRF requires at least one retrieval source with a positive weight.')

        expect(vectorSearch).not.toHaveBeenCalled()
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(keywordSearch).not.toHaveBeenCalled()
    })

    it('ignores an RRF setting outside hybrid mode', async () => {
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'kb-1',
                        type: KnowledgebaseTypeEnum.Standard,
                        recall: { topK: 5, fusion: { mode: 'weighted_rrf' } },
                        graphRag: { enabled: true, mode: 'vector' }
                    }
                ]
            }))
        }
        const { handler, vectorRetriever, keywordRetriever } = createHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            { execute: jest.fn() } as unknown as QueryBus
        )
        jest.spyOn(vectorRetriever, 'retrieve').mockResolvedValue(vectorBatch([chunk('vector', { score: 0.8 })]))
        const keywordSearch = jest.spyOn(keywordRetriever, 'retrieve')

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'exact keyword',
                source: 'spec'
            })
        )

        expect(result.documents.map((document) => document.metadata.chunkId)).toEqual(['vector'])
        expect(keywordSearch).not.toHaveBeenCalled()
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
