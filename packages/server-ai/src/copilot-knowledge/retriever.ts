import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager'
import { Document, DocumentInterface } from '@langchain/core/documents'
import { BaseRetriever } from '@langchain/core/retrievers'
import {
	VectorStoreInterface,
	VectorStoreRetrieverInterface,
	VectorStoreRetrieverMMRSearchKwargs
} from '@langchain/core/vectorstores'
import { Logger } from '@nestjs/common'
import { CopilotKnowledgeService } from './copilot-knowledge.service'
import { AiBusinessRole } from '@xpert-ai/contracts'

/**
 * Type for options when adding a document to the VectorStore.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AddDocumentOptions = Record<string, any>

export type CopilotKnowledgeRetrieverOptions = {
	tenantId: string
	organizationId: string
    command: string | string[];
    role?: AiBusinessRole
    k?: number;
    score?: number;
    filter?: object | string
}

export class CopilotKnowledgeRetriever<V extends VectorStoreInterface = VectorStoreInterface>
	extends BaseRetriever
	implements VectorStoreRetrieverInterface
{
	readonly #logger = new Logger(CopilotKnowledgeRetriever.name)

	static lc_name() {
		return 'VectorStoreRetriever'
	}

	get lc_namespace() {
		return ['langchain_core', 'vectorstores']
	}

	vectorStore: V

	k = 4

	searchType = 'similarity'

	searchKwargs?: VectorStoreRetrieverMMRSearchKwargs

	filter?: V['FilterType']

	command: string | string[]
    role: AiBusinessRole
	score?: number
	_vectorstoreType(): string {
		return this.vectorStore._vectorstoreType()
	}

	constructor(private readonly service: CopilotKnowledgeService, private options: CopilotKnowledgeRetrieverOptions) {
		super()

        this.command = options?.command
        this.role = options?.role
        this.k = options?.k
        this.score = options?.score
        this.filter = options?.filter
	}

	async _getRelevantDocuments(query: string, runManager?: CallbackManagerForRetrieverRun): Promise<Document[]> {
		if (this.searchType === 'mmr') {
			if (typeof this.service.maxMarginalRelevanceSearch !== 'function') {
				throw new Error(
					`The vector store backing this retriever, ${this._vectorstoreType()} does not support max marginal relevance search.`
				)
			}

			return this.service.maxMarginalRelevanceSearch(query, {
				tenantId: this.options.tenantId,
				organizationId: this.options.organizationId,
				k: this.k,
				filter: this.filter as any,
				command: this.command,
				role: this.role,
				...this.searchKwargs
			})
		}

		const docs = await this.service.similaritySearch(query, {
			tenantId: this.options.tenantId,
			organizationId: this.options.organizationId,
			command: this.command,
			k: this.k,
			filter: this.filter as any,
			role: this.role,
			score: this.score
		})

		this.#logger.debug(`Got relevant ${docs.length} documents for: ${query}`)

		return docs
	}

    async addDocuments(documents: DocumentInterface[], options?: AddDocumentOptions): Promise<string[] | void> {
        return this.vectorStore.addDocuments(documents, options)
    }
}

export function createCopilotKnowledgeRetriever(service: CopilotKnowledgeService, options: CopilotKnowledgeRetrieverOptions) {
	return new CopilotKnowledgeRetriever(service, options)
}
