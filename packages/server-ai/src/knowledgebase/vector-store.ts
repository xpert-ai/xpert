import { Callbacks } from '@langchain/core/callbacks/manager'
import { DocumentInterface } from '@langchain/core/documents'
import { VectorStore } from '@langchain/core/vectorstores'
import { IKnowledgebase, IKnowledgeDocument, IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import { IRerank } from '@xpert-ai/plugin-sdk'
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import { TDocChunkMetadata } from '../knowledge-document/types'


export type TVectorSearchParams = {
	take?: number;
	skip?: number;
	search?: string
	filter?: Record<string, unknown>
}

type TEnabledVectorFilter = VectorStore['FilterType'] & {
	enabled?: boolean | null
}

function toEnabledVectorFilter(filter?: VectorStore['FilterType']): TEnabledVectorFilter {
	if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
		return {}
	}

	return Object.assign({}, filter)
}

function getCopilotModel(knowledgebase: IKnowledgebase) {
	return knowledgebase.copilotModel?.model || knowledgebase.copilotModel?.copilot?.copilotModel?.model
}

export type TEmbeddingVectorMetadata = {
	provider?: string | null
	model?: string | null
	embeddingModelFingerprint?: string | null
	embeddingDimensions?: number | null
	embeddingRevision?: number | null
	vectorIdCollectionName?: string | null
}

// Stable UUID v5 namespace for deriving physical vector ids from collectionName + chunkId.
// This keeps the logical chunkId stable while avoiding active/pending collection primary-key collisions.
const VECTOR_ID_NAMESPACE = '9439c750-10f5-4d70-bcc1-6dfd23f0313d'

export function createCollectionScopedVectorId(collectionName: string, chunkId: string) {
	return uuidv5(`${collectionName}:${chunkId}`, VECTOR_ID_NAMESPACE)
}

export class KnowledgeDocumentStore {
	private model: string | null = null

	get embeddingModel() {
		return this.embeddingMetadata.model ?? getCopilotModel(this.knowledgebase)
	}

	constructor(
		public knowledgebase: IKnowledgebase,
		public vStore: VectorStore,
		protected rerankModel?: IRerank,
		private readonly embeddingMetadata: TEmbeddingVectorMetadata = {}
	) {
		const model = getCopilotModel(knowledgebase)
		this.model = embeddingMetadata.model ?? model
	}

	private prepareChunksForEmbedding(chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]) {
		return chunks.map((chunk) => {
			// If searchContent exists in metadata, use it for vectorization (indexed fields only)
			// Store full pageContent in metadata for later restoration
			if (chunk.metadata?.searchContent) {
				return {
					...chunk,
					metadata: {
						...chunk.metadata,
						fullPageContent: chunk.pageContent
					},
					pageContent: chunk.metadata.searchContent
				}
			}
			return chunk
		})
	}

	private createVectorId(chunkId: string) {
		return this.embeddingMetadata.vectorIdCollectionName
			? createCollectionScopedVectorId(this.embeddingMetadata.vectorIdCollectionName, chunkId)
			: chunkId
	}

	private resolveVectorIds(
		chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
		ids?: string[]
	) {
		const sourceIds = ids ?? chunks.map((chunk) => chunk.id ?? chunk.metadata?.chunkId).filter((id): id is string => !!id)
		return sourceIds.length === chunks.length ? sourceIds.map((id) => this.createVectorId(id)) : undefined
	}

	async addKnowledgeDocument(
		knowledgeDocument: IKnowledgeDocument,
		chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
		options?: { ids?: string[] }
	) {
		chunks.forEach((item) => {
			this.fillMetadata(item, knowledgeDocument)
		})

		const chunksForEmbedding = this.prepareChunksForEmbedding(chunks)

		const ids = this.resolveVectorIds(chunksForEmbedding, options?.ids)
		return await this.vStore.addDocuments(chunksForEmbedding, ids ? { ids } : undefined)
	}

	async addKnowledgeChunks(
		chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
		options?: { ids?: string[] }
	) {
		chunks.forEach((item) => {
			if (!item.documentId) {
				throw new Error(`Chunk '${item.id ?? item.metadata?.chunkId ?? 'unknown'}' has no document id`)
			}
			this.fillMetadata(item, { id: item.documentId })
		})

		const chunksForEmbedding = this.prepareChunksForEmbedding(chunks)
		const ids = this.resolveVectorIds(chunksForEmbedding, options?.ids)
		return await this.vStore.addDocuments(chunksForEmbedding, ids ? { ids } : undefined)
	}
	
	/**
	 * Restore full pageContent from metadata for retrieved documents
	 * This is needed for table documents where only indexed fields were used for vectorization
	 */
	private restorePageContent(doc: DocumentInterface): DocumentInterface {
		if (doc.metadata?.fullPageContent) {
			return {
				...doc,
				pageContent: doc.metadata.fullPageContent
			}
		}
		return doc
	}

	async deleteKnowledgeDocument(item: IKnowledgeDocument) {
		return await this.vStore.delete({ filter: { knowledgeId: item.id } })
	}

	/**
	 * Find all chunks of a document, filter by metadata
	 */
	async getChunks(knowledgeId: string, options: TVectorSearchParams) {
		const docs = await this.vStore.similaritySearch(options.search || '*', 10000, {
			...(options.filter ?? {}),
			knowledgeId
		})
		// Restore full pageContent for table documents
		const restoredDocs = docs.map((doc) => this.restorePageContent(doc))
		const skip = options.skip ?? 0
		return {
			items: options.take ? restoredDocs.slice(skip, skip + options.take) : restoredDocs,
			total: restoredDocs.length
		}
	}

	async getChunk(id: string) {
		const docs = await this.vStore.similaritySearch('*', 1, {chunkId: id})
		return docs[0] ? this.restorePageContent(docs[0]) : undefined
	}

	async deleteChunk(id: string) {
		return await this.vStore.delete({ filter: { chunkId: id } })
	}

	async updateChunk(id: string, chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>, document: IKnowledgeDocument) {
		const _chunk = await this.getChunk(id)
		await this.deleteChunk(id)
		chunk.pageContent ??= _chunk?.pageContent ?? ''
		chunk.metadata = {...(_chunk?.metadata ?? {}), ...chunk.metadata}
		chunk.metadata.chunkId = id
		this.fillMetadata(chunk, document)
		await this.vStore.addDocuments([chunk], { ids: [this.createVectorId(id)] })
	}

	async delete({filter}) {
		await this.vStore.delete({ filter })
	}

	async clear() {
		return await this.vStore.delete({ filter: {} })
	}

	async similaritySearchWithScore(query: string, k?: number, filter?: VectorStore['FilterType'], _callbacks?: Callbacks | undefined): Promise<[DocumentInterface, number][]> {
		const _filter = toEnabledVectorFilter(filter)
		// Mivlus error: invalid expression: knowledgeId IN ['c756e8fa-0a8c-4ae2-a4fa-eef65b2f0624'] AND enabled == true: invalid parameter
		// if (!_filter.knowledgeId && this.knowledgebase.documents?.length) {
		// 	_filter.knowledgeId = {
		// 		in: this.knowledgebase.documents.filter((doc) => !doc.disabled).map((doc) => doc.id)
		// 	}
		// }
		if (_filter.enabled == null) {
			_filter.enabled = true
		}

		const results = await this.vStore.similaritySearchWithScore(query, k, _filter, _callbacks)
		// Restore full pageContent for table documents
		return results.map(([doc, score]) => [this.restorePageContent(doc), score])
	}

	async rerank(docs: DocumentInterface[], query: string, options: {
  		topN: number
	}) {
		return this.rerankModel.rerank(docs,
			query,
			options
		)
	}

	fillMetadata(document: IKnowledgeDocumentChunk, knowledgeDocument: Pick<IKnowledgeDocument, 'id'>) {
		document.metadata ??= {} as TDocChunkMetadata
		document.metadata.enabled ??= true
		document.metadata.knowledgeId = knowledgeDocument.id
		document.metadata.documentId = knowledgeDocument.id
		document.metadata.parentChunkId ??= null
		document.metadata.model = this.model
		document.metadata.provider = this.embeddingMetadata.provider ?? null
		document.metadata.embeddingModelFingerprint = this.embeddingMetadata.embeddingModelFingerprint ?? null
		document.metadata.embeddingDimensions = this.embeddingMetadata.embeddingDimensions ?? null
		document.metadata.embeddingRevision = this.embeddingMetadata.embeddingRevision ?? null
		document.metadata.chunkId ??= document.id ?? uuidv4() // Ensure chunkId exists
		document.metadata.source ??= "blob"
		document.metadata.blobType ??= 'text/plain'
		document.metadata.loc ??= {}
	}
}
