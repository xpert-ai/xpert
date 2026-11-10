import { createService } from '../testing/document-service.fixture'
import { IKnowledgeDocument, IKnowledgeDocumentChunk, VectorTypeEnum } from '@xpert-ai/contracts'
import type { KnowledgeDocumentStore } from '../../knowledgebase'
import { computeKnowledgeDocumentChunkHash, computeKnowledgeDocumentContentHash } from '../document-hash'
import { KnowledgeDocument } from '../document.entity'

describe('Document chunks', () => {
    it('returns chunk-level incremental sync statistics', async () => {
        const unchangedIncoming = {
            pageContent: 'same content',
            metadata: { chunkId: 'chunk-a', chunkIndex: 0 }
        } as IKnowledgeDocumentChunk
        const changedIncoming = {
            pageContent: 'new content',
            metadata: { chunkId: 'chunk-b-new', chunkIndex: 1 }
        } as IKnowledgeDocumentChunk
        const addedIncoming = {
            pageContent: 'added content',
            metadata: { chunkId: 'chunk-c', chunkIndex: 2 }
        } as IKnowledgeDocumentChunk
        const unchangedExisting = {
            id: 'row-a',
            ...unchangedIncoming,
            contentHash: computeKnowledgeDocumentChunkHash(unchangedIncoming)
        } as IKnowledgeDocumentChunk
        const changedExisting = {
            id: 'row-b',
            pageContent: 'old content',
            metadata: { chunkId: 'chunk-b-old', chunkIndex: 1 },
            contentHash: computeKnowledgeDocumentChunkHash({
                pageContent: 'old content',
                metadata: { chunkId: 'chunk-b-old', chunkIndex: 1 }
            } as IKnowledgeDocumentChunk)
        } as IKnowledgeDocumentChunk
        const deletedExisting = {
            id: 'row-deleted',
            pageContent: 'deleted content',
            metadata: { chunkId: 'chunk-deleted', chunkIndex: 3 },
            contentHash: computeKnowledgeDocumentChunkHash({
                pageContent: 'deleted content',
                metadata: { chunkId: 'chunk-deleted', chunkIndex: 3 }
            } as IKnowledgeDocumentChunk)
        } as IKnowledgeDocumentChunk
        const questions = {
            status: 'ready' as const,
            generationId: 'generation',
            sourceHash: 'source',
            inputHash: 'input',
            updatedAt: '2026-09-10T00:00:00Z',
            questions: [{ id: 'q1', question: 'Question?' }],
            vectorIds: ['question-unchanged']
        }
        unchangedExisting.metadata.questionGeneration = questions
        changedExisting.metadata.questionGeneration = { ...questions, vectorIds: ['question-changed'] }
        deletedExisting.metadata.questionGeneration = { ...questions, vectorIds: ['question-deleted'] }
        const service = createService([])
        Object.assign(service.chunkMocks, {
            findAll: jest.fn(async () => ({
                items: [unchangedExisting, changedExisting, deletedExisting]
            })),
            upsertBulk: jest.fn(async (chunks: IKnowledgeDocumentChunk[]) =>
                chunks.map((chunk) => ({
                    ...chunk,
                    id: chunk.id ?? `row-${chunk.metadata?.chunkId}`
                }))
            ),
            delete: jest.fn(),
            findAllEmbeddingNodes: jest.fn((chunks: IKnowledgeDocumentChunk[]) => chunks)
        })
        const vectorStore = {
            deleteChunks: jest.fn()
        } as unknown as KnowledgeDocumentStore

        const result = await service.syncChunksIncrementally(
            {
                id: 'doc-1',
                knowledgebaseId: 'kb-1',
                contentHash: computeKnowledgeDocumentContentHash([unchangedExisting, changedExisting, deletedExisting]),
                chunks: [unchangedIncoming, changedIncoming, addedIncoming]
            } as IKnowledgeDocument,
            vectorStore
        )

        expect(result.statistics).toEqual({
            total: 3,
            skipped: 1,
            added: 1,
            updated: 1,
            deleted: 1
        })
        expect(vectorStore.deleteChunks).toHaveBeenCalledWith(expect.arrayContaining(['row-b', 'row-deleted']))
        expect(result.chunks.find((chunk) => chunk.id === 'row-a').metadata.questionGeneration).toEqual(questions)
        expect(vectorStore.deleteChunks).toHaveBeenCalledWith(
            expect.arrayContaining(['question-changed', 'question-deleted'])
        )
        expect(vectorStore.deleteChunks).not.toHaveBeenCalledWith(expect.arrayContaining(['question-unchanged']))
        expect(result.embeddingChunks.map((chunk) => chunk.pageContent)).toEqual(
            expect.arrayContaining(['new content', 'added content'])
        )
        expect(result.embeddingChunks).toHaveLength(2)
    })

    it.each([null, 'previous-published-hash'])(
        're-embeds persisted chunks after an interrupted sync (published hash: %s)',
        async (contentHash) => {
            const chunk = {
                id: 'row-a',
                pageContent: 'stored before embedding failed',
                metadata: { chunkId: 'chunk-a', chunkIndex: 0 }
            } as IKnowledgeDocumentChunk
            chunk.contentHash = computeKnowledgeDocumentChunkHash(chunk)
            const service = createService([])
            Object.assign(service.chunkMocks, {
                findAll: jest.fn(async () => ({ items: [chunk] })),
                upsertBulk: jest.fn(async (chunks: IKnowledgeDocumentChunk[]) => chunks),
                delete: jest.fn(),
                findAllEmbeddingNodes: jest.fn((chunks: IKnowledgeDocumentChunk[]) => chunks)
            })
            const vectorStore = { deleteChunks: jest.fn() } as unknown as KnowledgeDocumentStore
            const result = await service.syncChunksIncrementally(
                {
                    id: 'doc',
                    knowledgebaseId: 'kb',
                    contentHash,
                    chunks: [chunk]
                } as IKnowledgeDocument,
                vectorStore
            )
            expect(result.embeddingChunks).toHaveLength(1)
            expect(result.embeddingChunks[0].id).toBe('row-a')
            expect(vectorStore.deleteChunks).toHaveBeenCalledWith(['row-a'])
            expect(result.statistics).toMatchObject({ skipped: 0, updated: 1 })
        }
    )

    it('adds stored chunk versions to vector search results', async () => {
        const vectorStore = {
            getChunks: jest.fn(async () => ({
                items: [
                    {
                        pageContent: 'matched chunk',
                        metadata: {
                            chunkId: 'chunk-1'
                        }
                    }
                ],
                total: 1
            }))
        }
        const service = createService([], {
            knowledgebaseService: {
                getActiveVectorStore: jest.fn(async () => vectorStore)
            }
        })
        jest.spyOn(service, 'findOne').mockResolvedValue({
            id: 'doc-1',
            knowledgebase: {}
        } as KnowledgeDocument)
        Object.assign(service.chunkMocks, {
            findAll: jest.fn(async () => ({
                items: [
                    {
                        id: 'chunk-1',
                        version: 7,
                        contentHash: 'chunk-content-hash'
                    }
                ]
            }))
        })

        const result = await service.getChunks('doc-1', {
            search: 'matched',
            skip: 0,
            take: 20
        })

        expect(result.items[0]).toEqual(
            expect.objectContaining({
                id: 'chunk-1',
                version: 7,
                contentHash: 'chunk-content-hash'
            })
        )
    })

    it('limits Milvus management searches to canonical source ids in the requested document', async () => {
        const vectorStore = {
            vectorStoreType: VectorTypeEnum.MILVUS,
            getChunks: jest.fn(async () => ({ items: [], total: 0 }))
        }
        const service = createService([], {
            knowledgebaseService: { getActiveVectorStore: jest.fn(async () => vectorStore) }
        })
        jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'doc-1', knowledgebase: {} } as KnowledgeDocument)
        const findAll = jest.fn(async () => ({ items: [{ id: 'source-id' }] }))
        Object.assign(service.chunkMocks, { findAll })
        await service.getChunks('doc-1', { search: 'matched', take: 20 })
        expect(findAll).toHaveBeenCalledWith({ where: { documentId: 'doc-1' }, select: { id: true } })
        expect(vectorStore.getChunks).toHaveBeenCalledWith('doc-1', {
            search: 'matched',
            take: 20,
            sourceChunkIds: ['source-id']
        })
    })

    it('returns stored document chunks in chunkIndex order when not searching', async () => {
        const service = createService([])
        const findAll = jest.fn(async () => ({
            items: [
                {
                    id: 'chunk-2',
                    pageContent: 'second',
                    metadata: { chunkId: 'chunk-2', chunkIndex: 1 }
                },
                {
                    id: 'chunk-1',
                    pageContent: 'first',
                    metadata: { chunkId: 'chunk-1', chunkIndex: 0 }
                }
            ],
            total: 2
        }))
        Object.assign(service.chunkMocks, {
            findAll
        })

        const result = await service.getChunks('doc-1', {
            skip: 0,
            take: 20
        })

        expect(findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                order: { createdAt: 'ASC' }
            })
        )
        expect(result.items.map((chunk) => chunk.id)).toEqual(['chunk-1', 'chunk-2'])
    })

    it('includes an exact evidence chunk outside the current document page', async () => {
        const service = createService([])
        const findAll = jest
            .fn()
            .mockResolvedValueOnce({
                items: [{ id: 'chunk-1', pageContent: 'first page chunk', metadata: { chunkIndex: 0 } }],
                total: 25
            })
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'row-25',
                        pageContent: 'exact cited evidence',
                        metadata: { chunkId: 'evidence-chunk-25', chunkIndex: 24 }
                    }
                ],
                total: 1
            })
        Object.assign(service.chunkMocks, { findAll })

        const result = await service.getChunks('doc-1', {
            skip: 0,
            take: 20,
            targetChunkId: 'evidence-chunk-25'
        })

        expect(result.total).toBe(25)
        expect(result.items.map((chunk) => chunk.metadata?.chunkId ?? chunk.id)).toEqual([
            'evidence-chunk-25',
            'chunk-1'
        ])
        expect(findAll).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                take: 1,
                skip: 0,
                where: expect.any(Array)
            })
        )
    })
})
