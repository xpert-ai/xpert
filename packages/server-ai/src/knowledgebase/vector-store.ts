import { Callbacks } from '@langchain/core/callbacks/manager'
import { DocumentInterface } from '@langchain/core/documents'
import { VectorStore } from '@langchain/core/vectorstores'
import { IKnowledgebase, IKnowledgeDocument, IKnowledgeDocumentChunk } from '@metad/contracts'
import { v4 as uuidv4 } from 'uuid'
import { IRerank } from '../ai-model/types/rerank'
import { TDocChunkMetadata } from '../knowledge-document/types'


export type TVectorSearchParams = {
	take?: number;
	skip?: number;
	search?: string
	filter?: Record<string, any>
}

function getCopilotModel(knowledgebase: IKnowledgebase) {
	return knowledgebase.copilotModel?.model || knowledgebase.copilotModel?.copilot?.copilotModel?.model
}


export class KnowledgeDocumentStore {
	private model: string | null = null

	get embeddingModel() {
		return getCopilotModel(this.knowledgebase)
	}

	constructor(
		public knowledgebase: IKnowledgebase,
		public vStore: VectorStore,
		protected rerankModel?: IRerank
	) {
		const model = getCopilotModel(knowledgebase)
		this.model = model
	}

	async addKnowledgeDocument(
		knowledgeDocument: IKnowledgeDocument,
		chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
	) {
		chunks.forEach((item) => {
			this.fillMetadata(item, knowledgeDocument)
		})
		return await this.vStore.addDocuments(chunks)
	}

	async deleteKnowledgeDocument(item: IKnowledgeDocument) {
		try {
			return await this.vStore.delete({ filter: { knowledgeId: item.id } })
		} catch (error) {
			return
		}
	}

	/**
	 * Find all chunks of a document, filter by metadata
	 */
	async getChunks(knowledgeId: string, options: TVectorSearchParams) {
		const docs = await this.vStore.similaritySearch(options.search || '*', 10000, {
			...(options.filter ?? {}),
			knowledgeId
		})
		const skip = options.skip ?? 0
		return {
			items: options.take ? docs.slice(skip, skip + options.take) : docs,
			total: docs.length
		}
	}

	async getChunk(id: string) {
		const docs = await this.vStore.similaritySearch('*', 1, {chunkId: id})
		return docs[0]
	}

	async deleteChunk(id: string) {
		return await this.vStore.delete({ ids: [id] })
	}

	async updateChunk(id: string, chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>, document: IKnowledgeDocument) {
		const _chunk = await this.getChunk(id)
		await this.vStore.delete({ ids: [id] })
		chunk.pageContent ??= _chunk?.pageContent ?? ''
		chunk.metadata = {...(_chunk?.metadata ?? {}), ...chunk.metadata}
		chunk.metadata.chunkId = id
		this.fillMetadata(chunk, document)
		await this.vStore.addDocuments([chunk])
	}

	async delete({filter}) {
		await this.vStore.delete({ filter })
	}

	async clear() {
		return await this.vStore.delete({ filter: {} })
	}

	async similaritySearchWithScore(query: string, k?: number, filter?: VectorStore['FilterType'], _callbacks?: Callbacks | undefined): Promise<[DocumentInterface, number][]> {
		const _filter = (filter ?? {}) as any
		// Mivlus error: invalid expression: knowledgeId IN ['c756e8fa-0a8c-4ae2-a4fa-eef65b2f0624'] AND enabled == true: invalid parameter
		// if (!_filter.knowledgeId && this.knowledgebase.documents?.length) {
		// 	_filter.knowledgeId = {
		// 		in: this.knowledgebase.documents.filter((doc) => !doc.disabled).map((doc) => doc.id)
		// 	}
		// }
		if (_filter.enabled == null) {
			_filter.enabled = true
		}

		return this.vStore.similaritySearchWithScore(query, k, _filter, _callbacks)
	}

	async rerank(docs: DocumentInterface[], query: string, options: {
  		topN: number
	}) {
		return this.rerankModel.rerank(docs,
			query,
			options
		)
	}

	fillMetadata(document: IKnowledgeDocumentChunk, knowledgeDocument: IKnowledgeDocument) {
		document.metadata.enabled ??= true
		document.metadata.knowledgeId = knowledgeDocument.id
		document.metadata.model = this.model
		document.metadata.chunkId ??= uuidv4()
		document.metadata.source ??= "blob"
		document.metadata.blobType ??= 'text/plain'
		document.metadata.loc ??= {}
	}
}
