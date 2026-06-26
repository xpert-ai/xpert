import { VectorStore } from '@langchain/core/vectorstores'
import { IKnowledgeDocument, IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import { TDocChunkMetadata } from '../knowledge-document/types'
import { createCollectionScopedVectorId, KnowledgeDocumentStore } from './vector-store'

describe('KnowledgeDocumentStore vector ids', () => {
	it('derives different stable vector ids for the same chunk in different collections', () => {
		const chunkId = '066d9749-8c7b-4e83-9e2a-7d6cf2b8133d'
		const activeId = createCollectionScopedVectorId('active-collection', chunkId)
		const pendingId = createCollectionScopedVectorId('pending-collection', chunkId)

		expect(activeId).toMatch(/^[0-9a-f-]{36}$/)
		expect(activeId).toBe(createCollectionScopedVectorId('active-collection', chunkId))
		expect(activeId).not.toBe(pendingId)
		expect(activeId).not.toBe(chunkId)
	})

	it('uses collection-scoped vector ids while keeping chunk metadata stable', async () => {
		const addDocuments = jest.fn()
		const store = new KnowledgeDocumentStore(
			{
				id: 'knowledgebase-id',
				name: 'Knowledgebase',
				type: null
			},
			{
				addDocuments
			} as unknown as VectorStore,
			undefined,
			{
				model: 'text-embedding-v1',
				vectorIdCollectionName: 'pending-collection'
			}
		)
		const chunk = {
			id: '066d9749-8c7b-4e83-9e2a-7d6cf2b8133d',
			documentId: 'document-id',
			pageContent: 'content'
		} satisfies Partial<IKnowledgeDocumentChunk<TDocChunkMetadata>>

		await store.addKnowledgeChunks([chunk as IKnowledgeDocumentChunk<TDocChunkMetadata>])

		expect(addDocuments).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					metadata: expect.objectContaining({
						chunkId: chunk.id,
						model: 'text-embedding-v1'
					})
				})
			],
			{
				ids: [createCollectionScopedVectorId('pending-collection', chunk.id)]
			}
		)
	})

	it('updates existing vectors by physical vector id without rewriting logical chunk metadata', async () => {
		const addDocuments = jest.fn()
		const deleteDocuments = jest.fn()
		const similaritySearch = jest.fn().mockResolvedValue([])
		const collectionName = 'active-collection'
		const chunkId = '066d9749-8c7b-4e83-9e2a-7d6cf2b8133d'
		const logicalChunkId = 'source-parser-chunk-id'
		const store = new KnowledgeDocumentStore(
			{
				id: 'knowledgebase-id',
				name: 'Knowledgebase',
				type: null
			},
			{
				addDocuments,
				delete: deleteDocuments,
				similaritySearch
			} as unknown as VectorStore,
			undefined,
			{
				model: 'text-embedding-v1',
				vectorIdCollectionName: collectionName
			}
		)

		await store.updateChunk(
			chunkId,
			{
				pageContent: 'updated content',
				metadata: {
					chunkId: logicalChunkId,
					enabled: false
				}
			} as IKnowledgeDocumentChunk<TDocChunkMetadata>,
			{
				id: 'document-id',
				parserId: 'default',
				parserConfig: {},
				type: 'txt',
				name: 'document.txt',
				filePath: '/tmp/document.txt'
			} as IKnowledgeDocument
		)

		expect(deleteDocuments).toHaveBeenCalledWith({
			ids: [createCollectionScopedVectorId(collectionName, chunkId)]
		})
		expect(addDocuments).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					metadata: expect.objectContaining({
						chunkId: logicalChunkId,
						model: 'text-embedding-v1'
					})
				})
			],
			{
				ids: [createCollectionScopedVectorId(collectionName, chunkId)]
			}
		)
	})

	it('deletes multiple chunks by collection-scoped physical vector ids', async () => {
		const deleteDocuments = jest.fn()
		const collectionName = 'active-collection'
		const chunkIds = ['066d9749-8c7b-4e83-9e2a-7d6cf2b8133d', '95fa4eb5-7cef-4b6d-92ad-6efbbf7f04aa']
		const store = new KnowledgeDocumentStore(
			{
				id: 'knowledgebase-id',
				name: 'Knowledgebase',
				type: null
			},
			{
				delete: deleteDocuments
			} as unknown as VectorStore,
			undefined,
			{
				vectorIdCollectionName: collectionName
			}
		)

		await store.deleteChunks(chunkIds)

		expect(deleteDocuments).toHaveBeenCalledWith({
			ids: chunkIds.map((chunkId) => createCollectionScopedVectorId(collectionName, chunkId))
		})
	})
})
