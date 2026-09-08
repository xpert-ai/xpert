import { DocumentInterface } from '@langchain/core/documents'
import { QueryBus } from '@nestjs/cqrs'
import {
    AiModelTypeEnum,
    DocumentMetadata,
    IKnowledgebase,
    KnowledgeRetrievalMode,
    KnowledgeGraphStatus,
    KnowledgebaseTypeEnum,
    VectorTypeEnum
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { DataSource } from 'typeorm'
import { KnowledgeDocumentChunkService } from '../../../knowledge-document/chunk/chunk.service'
import { KnowledgebaseService } from '../../knowledgebase.service'
import {
    GraphKnowledgeCandidateRetriever,
    KeywordKnowledgeCandidateRetriever,
    KnowledgeKeywordIndexService,
    LegacyWeightedFusion,
    VectorKnowledgeCandidateRetriever,
    WeightedRrfFusion
} from '../../retrieval'
import { KnowledgeSearchQuery } from '../knowledge-search.query'
import { KnowledgeSearchQueryHandler } from './knowledge-search.handler'

function document(chunkId: string, score: number): DocumentInterface<DocumentMetadata> {
    return { pageContent: chunkId, metadata: { chunkId, score } }
}

function createHarness(overrides: Partial<IKnowledgebase> = {}) {
    const knowledgebase = {
        id: 'kb-1',
        name: 'Knowledgebase',
        type: KnowledgebaseTypeEnum.Standard,
        recall: { topK: 5 },
        graphRag: { enabled: true },
        metadataSchema: [],
        ...overrides
    } as IKnowledgebase
    const vectorItems: [DocumentInterface<DocumentMetadata>, number][] = [
        [document('vector-high', 0.9), 0.1],
        [document('vector-low', 0.3), 0.7]
    ]
    const vectorStore = {
        embeddingModel: 'embedding-model',
        structuredSimilaritySearchWithScore: jest.fn(async (_query: string, topK: number) => ({
            items: vectorItems.slice(0, topK),
            candidateDocumentCount: 2,
            candidateChunkCount: 2
        })),
        rerank: jest.fn(
            async (
                documents: DocumentInterface<DocumentMetadata>[],
                _query: string,
                options: { topN: number; scoreThreshold?: number }
            ) =>
                documents
                    .map((_document, index) => ({ index, relevanceScore: (index + 1) / documents.length }))
                    .reverse()
                    .filter(
                        ({ relevanceScore }) =>
                            options.scoreThreshold === undefined || relevanceScore >= options.scoreThreshold
                    )
                    .slice(0, options.topN)
        )
    }
    const getActiveVectorStore = jest.fn(async () => vectorStore)
    const getRerankModel = jest.fn(async () => vectorStore)
    const knowledgebaseService = {
        findAll: jest.fn(async () => ({ items: [knowledgebase] })),
        searchExternalKnowledgebase: jest.fn(async () => ({
            chunks: [
                [document('external-high', 0.9), 0.9],
                [document('external-low', 0.3), 0.3]
            ]
        })),
        getActiveVectorStore,
        getRerankModel
    } as unknown as KnowledgebaseService
    const chunkService = {
        findAll: jest.fn(
            async (options: { where: { metadata: { objectLiteralParameters?: { ids?: string[] } } } }) => ({
                items: vectorItems
                    .filter(([doc]) =>
                        options.where.metadata.objectLiteralParameters?.ids?.includes(doc.metadata.chunkId)
                    )
                    .map(([doc]) => ({ ...doc, document: { id: 'document-1', disabled: false } }))
            })
        )
    } as unknown as KnowledgeDocumentChunkService
    const graphQuery = jest.fn(async () => ({ docs: [document('graph-hit', 0.2)] }))
    const keywordDataSource = {
        options: { type: 'postgres' },
        query: jest.fn(async () => [
            {
                chunkRowId: 'keyword-row',
                chunkId: 'keyword-hit',
                pageContent: 'keyword-hit',
                documentId: 'document-1',
                keywordScore: 0.2
            }
        ])
    } as unknown as DataSource
    const keywordIndexDataSource = {
        options: { type: 'postgres' },
        query: jest.fn(async () => [{ fullTextReady: true, trigramReady: true, documentNameTrigramReady: true }])
    } as unknown as DataSource
    const handler = new KnowledgeSearchQueryHandler(
        knowledgebaseService,
        new VectorKnowledgeCandidateRetriever(knowledgebaseService, chunkService),
        new GraphKnowledgeCandidateRetriever({ execute: graphQuery } as unknown as QueryBus),
        new KeywordKnowledgeCandidateRetriever(
            keywordDataSource,
            new KnowledgeKeywordIndexService(keywordIndexDataSource)
        ),
        new LegacyWeightedFusion(),
        new WeightedRrfFusion()
    )
    const retrievalLogService = { create: jest.fn() }
    Object.defineProperty(handler, 'retrievalLogService', { value: retrievalLogService })
    const execute = (input: Partial<KnowledgeSearchQuery['input']> = {}) =>
        handler.execute(
            new KnowledgeSearchQuery({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'quality requirements',
                source: 'spec',
                ...input
            })
        )
    return {
        execute,
        vectorStore,
        graphQuery,
        keywordDataSource,
        getActiveVectorStore,
        getRerankModel,
        retrievalLogService
    }
}

describe('Knowledge retrieval finalization', () => {
    it('still limits oversampled FAQ candidates to Top K when reranking is disabled', async () => {
        const { execute, vectorStore } = createHarness({
            type: KnowledgebaseTypeEnum.FAQ,
            recall: { mode: 'vector', topK: 1 }
        })
        const result = await execute()
        expect(result.documents.map((document) => document.metadata.chunkId)).toEqual(['vector-high'])
        expect(vectorStore.rerank).not.toHaveBeenCalled()
    })

    it('gives temporary FAQ reranking the same candidates as a saved model', async () => {
        const recall = { mode: 'vector' as const, topK: 1 }
        const temporary = createHarness({ type: KnowledgebaseTypeEnum.FAQ, recall })
        const saved = createHarness({ type: KnowledgebaseTypeEnum.FAQ, recall, rerankModelId: 'saved-model' })
        const result = await temporary.execute({ rerankModel: { model: 'test-rerank', copilotId: 'copilot-1' }, k: 1 })
        const expected = await saved.execute({ k: 1 })
        expect(result).toEqual(expected)
        expect(result.documents[0].metadata.chunkId).toBe('vector-low')
    })

    const originalVectorStore = environment.vectorStore
    beforeEach(() => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
    })
    afterEach(() => {
        environment.vectorStore = originalVectorStore
    })

    it('disables saved reranking for one test without changing defaults', async () => {
        const { execute, vectorStore } = createHarness({ rerankModelId: 'saved-model' })
        await execute({ rerankModel: null })
        expect(vectorStore.rerank).not.toHaveBeenCalled()
        await execute()
        expect(vectorStore.rerank).toHaveBeenCalledTimes(1)
    })

    it('uses an unsaved rerank model and can disable its inherited threshold', async () => {
        const { execute, vectorStore, getRerankModel } = createHarness({ recall: { rerankThreshold: 0.9 } })
        const model = { copilotId: 'copilot', model: 'rerank-test', modelType: AiModelTypeEnum.RERANK }
        await execute({ rerankModel: model, rerankThreshold: null })
        expect(getRerankModel).toHaveBeenCalledWith('kb-1', { xpertId: undefined, threadId: undefined }, model)
        expect(vectorStore.rerank.mock.calls[0][2]).not.toHaveProperty('scoreThreshold')
    })

    it.each<KnowledgeRetrievalMode>(['vector', 'keyword', 'graph', 'hybrid'])(
        'reranks the complete eligible %s results once',
        async (mode) => {
            const { execute, vectorStore } = createHarness({ rerankModelId: 'rerank-model' })
            const result = await execute({ retrieval: { mode } })

            expect(vectorStore.rerank).toHaveBeenCalledTimes(1)
            const [candidates] = vectorStore.rerank.mock.calls[0]
            expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(
                candidates.map(({ metadata }) => metadata.chunkId).reverse()
            )
            expect(result.diagnostics[0].hitCount).toBe(candidates.length)
        }
    )

    it.each<KnowledgeRetrievalMode>(['keyword', 'graph'])(
        'reranks %s evidence without requiring an available embedding model',
        async (mode) => {
            const { execute, getActiveVectorStore, getRerankModel } = createHarness({ rerankModelId: 'rerank-model' })
            getActiveVectorStore.mockRejectedValue(new Error('embedding provider unavailable'))

            const result = await execute({ retrieval: { mode }, xpertId: 'xpert-1', threadId: 'thread-1' })

            expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual([`${mode}-hit`])
            expect(getActiveVectorStore).not.toHaveBeenCalled()
            expect(getRerankModel).toHaveBeenCalledWith('kb-1', { xpertId: 'xpert-1', threadId: 'thread-1' })
        }
    )

    it.each([
        { mode: 'vector' as const, recallDiagnostics: { candidateChunkCount: 2 } },
        { mode: 'keyword' as const, recallDiagnostics: { keywordBranchHitCount: 1, keywordIndexStatus: 'ready' } },
        { mode: 'graph' as const, recallDiagnostics: { graphBranchHitCount: 1 } },
        { mode: 'hybrid' as const, recallDiagnostics: { vectorBranchHitCount: 2, graphBranchHitCount: 1 } }
    ])(
        'records a rerank failure without losing completed $mode recall diagnostics',
        async ({ mode, recallDiagnostics }) => {
            const { execute, vectorStore, retrievalLogService } = createHarness({ rerankModelId: 'rerank-model' })
            vectorStore.rerank.mockRejectedValue(new Error('rerank provider unavailable'))

            await expect(execute({ retrieval: { mode }, contentScope: 'original' })).rejects.toThrow(
                'rerank provider unavailable'
            )

            expect(retrievalLogService.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    hitCount: 0,
                    errorCode: 'rerank_failed',
                    diagnostics: expect.objectContaining({
                        ...recallDiagnostics,
                        contentScope: 'original',
                        errorCode: 'rerank_failed',
                        errors: ['rerank provider unavailable']
                    })
                })
            )
        }
    )

    it('records model initialization failures in the final rerank stage after vector recall', async () => {
        const { execute, getRerankModel, retrievalLogService } = createHarness({ rerankModelId: 'rerank-model' })
        getRerankModel.mockRejectedValue(new Error('rerank model access denied'))
        await expect(execute()).rejects.toThrow('rerank model access denied')
        expect(retrievalLogService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                errorCode: 'rerank_failed',
                diagnostics: expect.objectContaining({ candidateChunkCount: 2, errors: ['rerank model access denied'] })
            })
        )
    })

    it('filters only vector candidates before RRF and preserves graph and keyword evidence', async () => {
        const { execute } = createHarness({
            recall: {
                topK: 5,
                score: 0.5,
                fusion: { mode: 'weighted_rrf', weights: { vector: 1, graph: 1, keyword: 1 } }
            }
        })

        const result = await execute({ retrieval: { mode: 'hybrid' } })

        expect(result.documents.map(({ metadata }) => metadata.chunkId).sort()).toEqual([
            'graph-hit',
            'keyword-hit',
            'vector-high'
        ])
        expect(result.diagnostics[0]).toMatchObject({
            vectorBranchHitCount: 1,
            graphBranchHitCount: 1,
            keywordBranchHitCount: 1
        })
    })

    it.each<KnowledgeRetrievalMode>(['vector', 'hybrid'])(
        'lets final reranking select a FAQ beyond the first vector Top K in %s mode',
        async (mode) => {
            const { execute, vectorStore } = createHarness({
                type: KnowledgebaseTypeEnum.FAQ,
                rerankModelId: 'rerank-model',
                recall: {
                    topK: 1,
                    fusion: { mode: 'weighted_rrf', weights: { vector: 1, graph: 0, keyword: 0 } }
                }
            })

            const result = await execute({ retrieval: { mode } })

            expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(['vector-low'])
            expect(vectorStore.rerank).toHaveBeenCalledTimes(1)
            expect(vectorStore.rerank.mock.calls[0][0].map(({ metadata }) => metadata.chunkId)).toEqual([
                'vector-high',
                'vector-low'
            ])
            expect(result.diagnostics[0].hitCount).toBe(1)
        }
    )

    it.each<KnowledgeRetrievalMode>(['keyword', 'graph'])(
        'does not apply a stored vector threshold to %s results',
        async (mode) => {
            const { execute } = createHarness({ recall: { score: 0.95 } })
            const result = await execute({ retrieval: { mode } })
            expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual([`${mode}-hit`])
        }
    )

    it('applies the vector threshold before legacy fusion instead of filtering fused scores', async () => {
        const { execute } = createHarness({ recall: { score: 0.5 }, graphRag: { enabled: true, graphWeight: 0.9 } })
        const result = await execute({ retrieval: { mode: 'hybrid' } })
        expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(['graph-hit', 'vector-high'])
        expect(result.documents[1].metadata.score).toBeCloseTo(0.09)
    })

    it('lets the request override the stored vector threshold before reranking', async () => {
        const { execute, vectorStore } = createHarness({ recall: { score: 0.95 }, rerankModelId: 'rerank-model' })
        const result = await execute({ score: 0.1, retrieval: { mode: 'vector' } })
        expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(['vector-low', 'vector-high'])
        expect(vectorStore.rerank).toHaveBeenCalledTimes(1)
    })

    it.each([
        { score: null, expected: ['vector-high', 'vector-low'] },
        { score: undefined, expected: ['vector-high'] }
    ])('distinguishes an explicitly disabled vector threshold from inheritance: %j', async ({ score, expected }) => {
        const { execute } = createHarness({ recall: { score: 0.5 } })
        const result = await execute({ score, retrieval: { mode: 'vector' } })
        expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(expected)
    })

    it('preserves the external knowledgebase threshold fallback when the request contains null', async () => {
        const { execute, vectorStore } = createHarness({
            type: KnowledgebaseTypeEnum.External,
            recall: { score: 0.5 },
            rerankModelId: 'rerank-model'
        })
        const result = await execute({ score: null })
        expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(['external-high'])
        expect(vectorStore.rerank).not.toHaveBeenCalled()
    })

    it('passes the knowledgebase Top K to graph candidate retrieval when the request does not override it', async () => {
        const { execute, graphQuery } = createHarness({ recall: { topK: 2 } })
        await execute({ retrieval: { mode: 'graph' } })
        expect(graphQuery).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ k: 2 }) }))
    })

    it.each([{ graphRag: { enabled: false } }])(
        'skips an unavailable graph branch without discounting legacy vector scores: %j',
        async (overrides) => {
            const { execute, graphQuery } = createHarness(overrides)
            const result = await execute({ retrieval: { mode: 'hybrid' } })
            expect(graphQuery).not.toHaveBeenCalled()
            expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(['vector-high', 'vector-low'])
            expect(result.documents[0].metadata.score).toBeCloseTo(0.9)
            expect(result.diagnostics[0]).toMatchObject({ vectorBranchHitCount: 2, graphBranchHitCount: 0 })
        }
    )

    it('uses the graph enable switch despite a legacy disabled lifecycle status', async () => {
        const { execute, graphQuery } = createHarness({ graphStatus: KnowledgeGraphStatus.DISABLED })
        await execute({ retrieval: { mode: 'graph' } })
        expect(graphQuery).toHaveBeenCalled()
    })

    it('reranks all RRF candidates once and limits the final results to the request Top K', async () => {
        const { execute, vectorStore, graphQuery } = createHarness({
            rerankModelId: 'rerank-model',
            recall: { topK: 5, fusion: { mode: 'weighted_rrf', weights: { vector: 1, graph: 1, keyword: 1 } } }
        })
        const result = await execute({ k: 1, retrieval: { mode: 'hybrid' } })
        expect(vectorStore.rerank).toHaveBeenCalledTimes(1)
        expect(vectorStore.rerank.mock.calls[0][0].map(({ metadata }) => metadata.chunkId).sort()).toEqual([
            'graph-hit',
            'keyword-hit',
            'vector-high'
        ])
        expect(vectorStore.rerank.mock.calls[0][2]).toEqual({ topN: 1 })
        expect(graphQuery).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ k: 1 }) }))
        expect(result.documents).toHaveLength(1)
        expect(result.diagnostics[0].hitCount).toBe(1)
    })

    it('filters reranked candidates by the stored threshold before applying Top K', async () => {
        const { execute, vectorStore } = createHarness({
            rerankModelId: 'rerank-model',
            recall: { topK: 2, rerankThreshold: 0.75 }
        })

        const result = await execute({ retrieval: { mode: 'vector' } })

        expect(vectorStore.rerank).toHaveBeenCalledWith(expect.any(Array), 'quality requirements', {
            topN: 2,
            scoreThreshold: 0.75
        })
        expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(['vector-low'])
        expect(result.diagnostics[0].hitCount).toBe(1)
    })

    it('lets the request override the stored rerank threshold', async () => {
        const { execute, vectorStore } = createHarness({
            rerankModelId: 'rerank-model',
            recall: { topK: 2, rerankThreshold: 0.95 }
        })

        const result = await execute({ rerankThreshold: 0.4, retrieval: { mode: 'vector' } })

        expect(vectorStore.rerank).toHaveBeenCalledWith(expect.any(Array), 'quality requirements', {
            topN: 2,
            scoreThreshold: 0.4
        })
        expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(['vector-low', 'vector-high'])
    })

    it('lets the request disable the stored rerank threshold', async () => {
        const { execute, vectorStore } = createHarness({
            rerankModelId: 'rerank-model',
            recall: { topK: 2, rerankThreshold: 0.95 }
        })

        const result = await execute({ rerankThreshold: null, retrieval: { mode: 'vector' } })

        expect(vectorStore.rerank).toHaveBeenCalledWith(expect.any(Array), 'quality requirements', { topN: 2 })
        expect(result.documents.map(({ metadata }) => metadata.chunkId)).toEqual(['vector-low', 'vector-high'])
    })

    it('uses the default Top K for graph retrieval and final reranking when no value is configured', async () => {
        const { execute, vectorStore, graphQuery } = createHarness({ recall: {}, rerankModelId: 'rerank-model' })
        const result = await execute({ retrieval: { mode: 'graph' } })
        expect(graphQuery).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ k: 10 }) }))
        expect(vectorStore.rerank.mock.calls[0][2]).toEqual({ topN: 1 })
        expect(result.documents).toHaveLength(1)
    })

    it('omits a disabled graph branch from RRF while retaining the other configured sources', async () => {
        const { execute, graphQuery } = createHarness({
            graphRag: { enabled: false },
            recall: { fusion: { mode: 'weighted_rrf', weights: { vector: 1, graph: 1, keyword: 1 } } }
        })
        const result = await execute({ retrieval: { mode: 'hybrid' } })
        expect(graphQuery).not.toHaveBeenCalled()
        expect(result.documents.map(({ metadata }) => metadata.chunkId).sort()).toEqual([
            'keyword-hit',
            'vector-high',
            'vector-low'
        ])
        expect(result.diagnostics[0].graphBranchHitCount).toBe(0)
    })

    it('rejects RRF when its only configured source is an unavailable graph', async () => {
        const { execute, graphQuery, vectorStore, keywordDataSource } = createHarness({
            graphRag: { enabled: false },
            recall: { fusion: { mode: 'weighted_rrf', weights: { vector: 0, graph: 1, keyword: 0 } } }
        })
        await expect(execute({ retrieval: { mode: 'hybrid' } })).rejects.toThrow(
            'RRF requires at least one retrieval source with a positive weight.'
        )
        expect(graphQuery).not.toHaveBeenCalled()
        expect(vectorStore.structuredSimilaritySearchWithScore).not.toHaveBeenCalled()
        expect(keywordDataSource.query).not.toHaveBeenCalled()
    })
})
