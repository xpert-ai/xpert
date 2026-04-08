import { VectorStore } from '@langchain/core/vectorstores'
import { IKnowledgeDocument, IKnowledgeDocumentChunk, IKnowledgebase } from '@metad/contracts'
import { TDocChunkMetadata } from '../knowledge-document/types'
import { KnowledgeDocumentStore } from './vector-store'

describe('KnowledgeDocumentStore', () => {
	function createKnowledgebase(): IKnowledgebase {
		return {
			id: 'kb-1',
			copilotModel: {
				model: 'text-embedding-v4'
			}
		} as IKnowledgebase
	}

	function createDocument(): IKnowledgeDocument {
		return {
			id: 'doc-1',
			knowledgebaseId: 'kb-1'
		} as IKnowledgeDocument
	}

	function createVectorStoreMock() {
		return {
			addDocuments: jest.fn(),
			similaritySearch: jest.fn(),
			delete: jest.fn()
		} as unknown as VectorStore
	}

	it('adds vectors with stable ids from metadata.chunkId', async () => {
		const vStore = createVectorStoreMock()
		const store = new KnowledgeDocumentStore(createKnowledgebase(), vStore)
		const chunk: IKnowledgeDocumentChunk<TDocChunkMetadata> = {
			pageContent: 'hello world',
			metadata: {
				chunkId: 'chunk-meta-1'
			}
		} as IKnowledgeDocumentChunk<TDocChunkMetadata>

		await store.addKnowledgeDocument(createDocument(), [chunk])

		expect(vStore.addDocuments).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					pageContent: 'hello world',
					metadata: expect.objectContaining({
						chunkId: 'chunk-meta-1',
						knowledgeId: 'doc-1'
					})
				})
			],
			{
				ids: ['chunk-meta-1']
			}
		)
	})

	it('updates vectors by chunk metadata id instead of entity id', async () => {
		const vStore = createVectorStoreMock()
		vStore.similaritySearch = jest.fn().mockResolvedValue([
			{
				pageContent: 'old content',
				metadata: {
					chunkId: 'chunk-meta-1',
					enabled: true
				}
			}
		])
		const store = new KnowledgeDocumentStore(createKnowledgebase(), vStore)

		await store.updateChunk(
			'chunk-meta-1',
			{
				metadata: {
					enabled: false
				}
			} as IKnowledgeDocumentChunk<TDocChunkMetadata>,
			createDocument()
		)

		expect(vStore.delete).toHaveBeenCalledWith({
			filter: {
				chunkId: 'chunk-meta-1'
			}
		})
		expect(vStore.addDocuments).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					pageContent: 'old content',
					metadata: expect.objectContaining({
						chunkId: 'chunk-meta-1',
						enabled: false
					})
				})
			],
			{
				ids: ['chunk-meta-1']
			}
		)
	})

	it('deletes vectors by chunk metadata id filter', async () => {
		const vStore = createVectorStoreMock()
		const store = new KnowledgeDocumentStore(createKnowledgebase(), vStore)

		await store.deleteChunk('chunk-meta-1')

		expect(vStore.delete).toHaveBeenCalledWith({
			filter: {
				chunkId: 'chunk-meta-1'
			}
		})
	})
})
