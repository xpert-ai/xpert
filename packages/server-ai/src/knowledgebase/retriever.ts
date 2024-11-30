import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager'
import { Document, DocumentInterface } from '@langchain/core/documents'
import { BaseRetriever } from '@langchain/core/retrievers'
import { Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch"
import { getErrorMessage } from '@metad/server-common'
import { KnowledgeSearchQuery } from './queries'

/**
 * Docs Retriever for signle Knowledgebase
 */
export class KnowledgeRetriever extends BaseRetriever {
	lc_namespace = ['xpert', 'knowledgenase']

	readonly #logger = new Logger(KnowledgeRetriever.name)

	tenantId: string
	organizationId: string

	constructor(
		private readonly queryBus: QueryBus,
		private readonly knowledgebaseId: string
	) {
		super()
	}

	async _getRelevantDocuments(query: string, runManager?: CallbackManagerForRetrieverRun): Promise<Document[]> {
		this.#logger.debug(`Retrieving knowledge documents for query: ${query}`)

		this.metadata.knowledgebaseId = this.knowledgebaseId

		try {
			const results = await this.queryBus.execute<
				KnowledgeSearchQuery,
				{
					doc: DocumentInterface<Record<string, any>>
					score: number
				}[]
			>(
				new KnowledgeSearchQuery({
					tenantId: this.tenantId,
					organizationId: this.organizationId,
					knowledgebases: this.knowledgebaseId ? [this.knowledgebaseId] : [],
					query
				})
			)

			return results.map(({ doc }) => doc)
		} catch(error) {
			await dispatchCustomEvent("on_retriever_error", {knowledgebaseId: this.knowledgebaseId, error: getErrorMessage(error)})
			throw error
		}
	}
}

export function createKnowledgeRetriever(queryBus: QueryBus, knowledgebaseId: string) {
	class DynamicKnowledgeRetriever extends KnowledgeRetriever {
		// To enable langchain to obtain the actual knowledgebaseId of the Retriever as the event name
		static lc_name(): string {
			return knowledgebaseId
		}
		constructor(queryBus: QueryBus, knowledgebaseId: string) {
			super(queryBus, knowledgebaseId)
		}
	}
	return new DynamicKnowledgeRetriever(queryBus, knowledgebaseId) as KnowledgeRetriever
}
