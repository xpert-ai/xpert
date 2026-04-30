import { VectorStore } from '@langchain/core/vectorstores'
import { IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
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
})
