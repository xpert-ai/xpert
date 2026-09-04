import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata, IKnowledgebase, KnowledgebaseTypeEnum, VectorTypeEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import { PreparedKnowledgeFilter, prepareKnowledgeFilter } from '../filter'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeRetrievalRequest } from './types'
import { VectorKnowledgeCandidateRetriever } from './vector-knowledge-candidate.retriever'

function createKnowledgebase(overrides: Partial<IKnowledgebase> = {}): IKnowledgebase {
    return {
        id: 'kb-1',
        name: 'Knowledgebase',
        type: KnowledgebaseTypeEnum.Standard,
        recall: { topK: 5 },
        metadataSchema: [],
        ...overrides
    } as IKnowledgebase
}

function candidate(chunkId: string, metadata: Partial<DocumentMetadata> = {}): DocumentInterface<DocumentMetadata> {
    return {
        pageContent: `vector-${chunkId}`,
        metadata: {
            ...metadata,
            chunkId
        }
    }
}

function createRequest(
    knowledgebase: IKnowledgebase,
    preparedFilter: PreparedKnowledgeFilter,
    options: { query?: string; k?: number } = {}
): KnowledgeRetrievalRequest {
    return {
        knowledgebase,
        query: options.query ?? 'quality requirements',
        k: options.k,
        scope: {
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        },
        modelContext: {
            xpertId: 'xpert-1',
            threadId: 'thread-1'
        },
        preparedFilter
    }
}

describe('VectorKnowledgeCandidateRetriever', () => {
    const originalVectorStore = environment.vectorStore

    afterEach(() => {
        environment.vectorStore = originalVectorStore
    })

    it('preserves model context, distance scoring, relational hydration and diagnostics', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const knowledgebase = {
            id: 'kb-1',
            name: 'Knowledgebase',
            type: KnowledgebaseTypeEnum.Standard,
            recall: { topK: 5 },
            metadataSchema: []
        } as unknown as IKnowledgebase
        const vectorDocument: DocumentInterface<DocumentMetadata> = {
            pageContent: 'vector content',
            metadata: { chunkId: 'chunk-1' }
        }
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async () => ({
                items: [[vectorDocument, 0.2]],
                candidateDocumentCount: 1,
                candidateChunkCount: 1
            }))
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const chunkService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'chunk-row-1',
                        pageContent: 'stored content',
                        metadata: { chunkId: 'chunk-1' },
                        document: { id: 'document-1', disabled: false }
                    }
                ]
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })

        const result = await retriever.retrieve({
            knowledgebase,
            query: 'quality requirements',
            scope: {
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            modelContext: {
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            },
            preparedFilter
        })

        expect(knowledgebaseService.getActiveVectorStore).toHaveBeenCalledWith('kb-1', true, {
            xpertId: 'xpert-1',
            threadId: 'thread-1'
        })
        expect(vectorStore.structuredSimilaritySearchWithScore).toHaveBeenCalledWith('quality requirements', 5, {
            postgres: {
                sql: 'TRUE',
                parameters: [],
                knowledgebaseId: 'kb-1'
            }
        })
        expect(result.source).toBe('vector')
        expect(result.candidates).toEqual([
            {
                rank: 1,
                document: expect.objectContaining({
                    id: 'chunk-row-1',
                    pageContent: 'stored content',
                    metadata: expect.objectContaining({
                        chunkId: 'chunk-1',
                        score: 0.8
                    })
                })
            }
        ])
        expect(result.diagnostics).toEqual(
            expect.objectContaining({
                candidateDocumentCount: 1,
                candidateChunkCount: 1,
                hitCount: 1
            })
        )
    })

    it('keeps vector ranks when relational hydration returns a different array order', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const knowledgebase = createKnowledgebase()
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async () => ({
                items: [
                    [candidate('chunk-1'), 0.1],
                    [candidate('chunk-2'), 0.2]
                ],
                candidateDocumentCount: 2,
                candidateChunkCount: 2
            }))
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const chunkService = {
            findAll: jest.fn(async () => ({
                items: [
                    { pageContent: 'stored two', metadata: { chunkId: 'chunk-2' }, document: { disabled: false } },
                    { pageContent: 'stored one', metadata: { chunkId: 'chunk-1' }, document: { disabled: false } }
                ]
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })

        const result = await retriever.retrieve(createRequest(knowledgebase, preparedFilter))

        expect(result.candidates.map(({ document }) => document.metadata.chunkId)).toEqual(['chunk-2', 'chunk-1'])
        expect(result.candidates.map(({ rank }) => rank)).toEqual([2, 1])
    })

    it('oversamples FAQ vectors and keeps the best physical vector score per canonical FAQ', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const knowledgebase = createKnowledgebase({
            type: KnowledgebaseTypeEnum.FAQ,
            recall: { topK: 2 }
        })
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async () => ({
                items: [
                    [candidate('faq-1', { faqVectorId: 'faq-1::question:0' }), 0.1],
                    [candidate('faq-2', { faqVectorId: 'faq-2::question:0' }), 0.2],
                    [candidate('faq-1', { faqVectorId: 'faq-1::answer:0' }), 0.4],
                    [candidate('faq-3', { faqVectorId: 'faq-3::question:0' }), 0.5]
                ],
                candidateDocumentCount: 3,
                candidateChunkCount: 3
            }))
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const chunkService = {
            findAll: jest.fn(async () => ({
                items: [
                    { pageContent: 'FAQ one', metadata: { chunkId: 'faq-1' }, document: { disabled: false } },
                    { pageContent: 'FAQ two', metadata: { chunkId: 'faq-2' }, document: { disabled: false } },
                    { pageContent: 'FAQ three', metadata: { chunkId: 'faq-3' }, document: { disabled: false } }
                ]
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })

        const result = await retriever.retrieve(createRequest(knowledgebase, preparedFilter, { k: 2 }))

        expect(vectorStore.structuredSimilaritySearchWithScore).toHaveBeenCalledWith(
            'quality requirements',
            32,
            expect.any(Object)
        )
        expect(
            result.candidates.map(({ document, rank }) => ({
                id: document.metadata.chunkId,
                score: document.metadata.score,
                rank
            }))
        ).toEqual([
            { id: 'faq-1', score: 0.9, rank: 1 },
            { id: 'faq-2', score: 0.8, rank: 2 }
        ])
    })

    it('expands FAQ vector search until enough canonical FAQs are available', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const knowledgebase = createKnowledgebase({
            type: KnowledgebaseTypeEnum.FAQ,
            recall: { topK: 2 }
        })
        const firstFAQVectors = Array.from(
            { length: 32 },
            (_, index) =>
                [candidate('faq-1', { faqVectorId: `faq-1::part:${index}` }), 0.01 + index / 1000] as [
                    DocumentInterface<DocumentMetadata>,
                    number
                ]
        )
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async (_query: string, topK: number) => ({
                items:
                    topK === 32
                        ? firstFAQVectors
                        : [...firstFAQVectors, [candidate('faq-2', { faqVectorId: 'faq-2::question:0' }), 0.2]],
                candidateDocumentCount: 2,
                candidateChunkCount: 2
            }))
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const chunkService = {
            findAll: jest.fn(async () => ({
                items: [
                    { pageContent: 'FAQ one', metadata: { chunkId: 'faq-1' }, document: { disabled: false } },
                    { pageContent: 'FAQ two', metadata: { chunkId: 'faq-2' }, document: { disabled: false } }
                ]
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })

        const result = await retriever.retrieve(createRequest(knowledgebase, preparedFilter, { k: 2 }))

        expect(vectorStore.structuredSimilaritySearchWithScore).toHaveBeenNthCalledWith(
            1,
            'quality requirements',
            32,
            expect.any(Object)
        )
        expect(vectorStore.structuredSimilaritySearchWithScore).toHaveBeenNthCalledWith(
            2,
            'quality requirements',
            64,
            expect.any(Object)
        )
        expect(result.candidates.map(({ document }) => document.metadata.chunkId)).toEqual(['faq-1', 'faq-2'])
    })

    it('compiles effective filters for Milvus and keeps relational candidate diagnostics', async () => {
        environment.vectorStore = VectorTypeEnum.MILVUS
        const knowledgebase = createKnowledgebase()
        type MilvusSearchOptions = {
            milvus: { expression: string; values: Record<string, unknown> }
        }
        const structuredSimilaritySearchWithScore = jest.fn<
            Promise<{
                items: [DocumentInterface, number][]
                candidateDocumentCount: number
                candidateChunkCount: number
            }>,
            [string, number, MilvusSearchOptions]
        >(async () => ({
            items: [],
            candidateDocumentCount: 0,
            candidateChunkCount: 0
        }))
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore),
            countStructuredFilterCandidates: jest.fn(async () => ({
                candidateDocumentCount: 4,
                candidateChunkCount: 9
            }))
        }
        const chunkService = { findAll: jest.fn() }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            filters: {
                request: {
                    kind: 'condition',
                    field: 'document.fileExtension',
                    operator: 'eq',
                    value: { kind: 'literal', value: 'pdf' }
                }
            },
            vectorBackend: VectorTypeEnum.MILVUS
        })

        const result = await retriever.retrieve(
            createRequest(knowledgebase, preparedFilter, { query: 'filtered requirements' })
        )

        expect(vectorStore.structuredSimilaritySearchWithScore).toHaveBeenCalledWith('filtered requirements', 5, {
            milvus: {
                expression: expect.stringContaining('filterAttributes["document"]["fileExtension"]'),
                values: expect.any(Object)
            }
        })
        const milvusOptions = vectorStore.structuredSimilaritySearchWithScore.mock.calls[0][2]
        expect(milvusOptions.milvus.expression).toContain(
            'enabled == true and filterAttributes["document"]["disabled"] == false'
        )
        expect(Object.values(milvusOptions.milvus.values)).toContain('pdf')
        expect(knowledgebaseService.countStructuredFilterCandidates).toHaveBeenCalledWith(
            'kb-1',
            expect.objectContaining({ parameters: ['pdf'] })
        )
        expect(chunkService.findAll).not.toHaveBeenCalled()
        expect(result.diagnostics).toEqual(
            expect.objectContaining({
                candidateDocumentCount: 4,
                candidateChunkCount: 9,
                hitCount: 0
            })
        )
    })

    it('hydrates parent chunks from vector-matched children and keeps the best child score', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const knowledgebase = createKnowledgebase()
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async () => ({
                items: [
                    [candidate('child-1', { parentId: 'parent-1', tokens: 11 }), 0.1],
                    [candidate('child-2', { parentId: 'parent-1', tokens: 22 }), 0.3]
                ],
                candidateDocumentCount: 1,
                candidateChunkCount: 2
            }))
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const chunkService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'parent-row-1',
                        pageContent: 'parent content',
                        metadata: { chunkId: 'parent-1' },
                        children: [
                            { pageContent: 'child one', metadata: { chunkId: 'child-1' } },
                            { pageContent: 'child two', metadata: { chunkId: 'child-2' } },
                            { pageContent: 'not matched', metadata: { chunkId: 'child-3' } }
                        ],
                        document: { id: 'document-1', disabled: false }
                    }
                ]
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })

        const result = await retriever.retrieve(createRequest(knowledgebase, preparedFilter))

        expect(chunkService.findAll).toHaveBeenCalledTimes(1)
        expect(chunkService.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ relations: ['children', 'document'] })
        )
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]).toEqual(
            expect.objectContaining({
                rank: 1,
                document: expect.objectContaining({
                    id: 'parent-row-1',
                    metadata: expect.objectContaining({ chunkId: 'parent-1', score: 0.9 }),
                    children: [
                        expect.objectContaining({
                            metadata: expect.objectContaining({ chunkId: 'child-1', score: 0.9, tokens: 11 })
                        }),
                        expect.objectContaining({
                            metadata: expect.objectContaining({ chunkId: 'child-2', score: 0.7, tokens: 22 })
                        })
                    ]
                })
            })
        )
    })

    it('ranks a parent by the best vector rank among its enabled matched children', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const knowledgebase = createKnowledgebase()
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async () => ({
                items: [
                    [candidate('disabled-child', { parentId: 'parent-1' }), 0.1],
                    [candidate('enabled-child', { parentId: 'parent-1' }), 0.3]
                ],
                candidateDocumentCount: 1,
                candidateChunkCount: 2
            }))
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const chunkService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        pageContent: 'parent content',
                        metadata: { chunkId: 'parent-1' },
                        children: [
                            { pageContent: 'disabled', metadata: { chunkId: 'disabled-child', enabled: false } },
                            { pageContent: 'enabled', metadata: { chunkId: 'enabled-child' } }
                        ],
                        document: { disabled: false }
                    }
                ]
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })

        const result = await retriever.retrieve(createRequest(knowledgebase, preparedFilter))

        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]).toEqual(
            expect.objectContaining({
                rank: 2,
                document: expect.objectContaining({
                    metadata: expect.objectContaining({ chunkId: 'parent-1', score: 0.7 }),
                    children: [
                        expect.objectContaining({ metadata: expect.objectContaining({ chunkId: 'enabled-child' }) })
                    ]
                })
            })
        )
    })

    it('drops disabled chunks and chunks belonging to disabled documents', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const knowledgebase = createKnowledgebase()
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async () => ({
                items: [
                    [candidate('enabled'), 0.1],
                    [candidate('disabled-chunk'), 0.2],
                    [candidate('disabled-document'), 0.3]
                ],
                candidateDocumentCount: 3,
                candidateChunkCount: 3
            }))
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const chunkService = {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        pageContent: 'enabled content',
                        metadata: { chunkId: 'enabled' },
                        document: { id: 'document-1', disabled: false }
                    },
                    {
                        pageContent: 'disabled chunk content',
                        metadata: { chunkId: 'disabled-chunk', enabled: false },
                        document: { id: 'document-1', disabled: false }
                    },
                    {
                        pageContent: 'disabled document content',
                        metadata: { chunkId: 'disabled-document' },
                        document: { id: 'document-2', disabled: true }
                    }
                ]
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })

        const result = await retriever.retrieve(createRequest(knowledgebase, preparedFilter))

        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].document).toEqual(
            expect.objectContaining({
                pageContent: 'enabled content',
                metadata: expect.objectContaining({ chunkId: 'enabled', score: 0.9 })
            })
        )
        expect(result.diagnostics.hitCount).toBe(1)
    })

    it('keeps reranking inside the vector branch when a rerank model is configured', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const knowledgebase = createKnowledgebase({
            recall: { topK: 2 },
            rerankModelId: 'rerank-model'
        })
        const vectorStore = {
            embeddingModel: 'embedding-model',
            structuredSimilaritySearchWithScore: jest.fn(async () => ({
                items: [
                    [candidate('chunk-1'), 0.2],
                    [candidate('chunk-2'), 0.1]
                ],
                candidateDocumentCount: 2,
                candidateChunkCount: 2
            })),
            rerank: jest.fn(async () => [{ index: 1, relevanceScore: 0.97 }])
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const chunkService = {
            findAll: jest.fn(async () => ({
                items: [
                    { pageContent: 'stored one', metadata: { chunkId: 'chunk-1' }, document: { disabled: false } },
                    { pageContent: 'stored two', metadata: { chunkId: 'chunk-2' }, document: { disabled: false } }
                ]
            }))
        }
        const retriever = new VectorKnowledgeCandidateRetriever(
            knowledgebaseService as unknown as KnowledgebaseService,
            chunkService as unknown as KnowledgeDocumentChunkService
        )
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR
        })

        const result = await retriever.retrieve(createRequest(knowledgebase, preparedFilter, { k: 1 }))

        expect(vectorStore.rerank).toHaveBeenCalledWith(expect.any(Array), 'quality requirements', { topN: 1 })
        expect(result.candidates).toEqual([
            {
                rank: 1,
                document: expect.objectContaining({
                    pageContent: 'stored two',
                    metadata: expect.objectContaining({
                        chunkId: 'chunk-2',
                        score: 0.9,
                        relevanceScore: 0.97
                    })
                })
            }
        ])
        expect(result.diagnostics.hitCount).toBe(1)
    })
})
