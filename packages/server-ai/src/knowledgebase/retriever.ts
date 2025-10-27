import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager'
import { Document, DocumentInterface } from '@langchain/core/documents'
import { BaseRetriever } from '@langchain/core/retrievers'
import { Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch"
import { ChatMessageEventTypeEnum, DocumentMetadata, TKBRecallParams } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { instanceToPlain } from 'class-transformer'
import { omit } from 'lodash'
import { KnowledgeSearchQuery } from './queries'
import { DocumentChunkDTO } from '../knowledge-document/dto'

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
		private readonly knowledgebaseId: string,
		private readonly options?: TKBRecallParams
	) {
		super()
	}

	async _getRelevantDocuments(query: string, runManager?: CallbackManagerForRetrieverRun): Promise<Document[]> {
		this.#logger.debug(`Retrieving knowledge documents for query: ${query}`)

		this.metadata.knowledgebaseId = this.knowledgebaseId

		try {
			const results = await this.queryBus.execute<
				KnowledgeSearchQuery,
				DocumentInterface<DocumentMetadata>[]
			>(
				new KnowledgeSearchQuery({
					tenantId: this.tenantId,
					organizationId: this.organizationId,
					knowledgebases: this.knowledgebaseId ? [this.knowledgebaseId] : [],
					query,
					score: this.options?.score,
					k: this.options?.topK,
					source: 'retriever',
				})
			)
			return results.map((doc) => instanceToPlain(
				new DocumentChunkDTO(
					{...doc, metadata: omit(doc.metadata, 'children') }
				)
			) as Document)
		} catch(error) {
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR, {knowledgebaseId: this.knowledgebaseId, error: getErrorMessage(error)})
			throw error
		}
	}
}

export function createKnowledgeRetriever(queryBus: QueryBus, knowledgebaseId: string, options?: TKBRecallParams) {
	class DynamicKnowledgeRetriever extends KnowledgeRetriever {
		// To enable langchain to obtain the actual knowledgebaseId of the Retriever as the event name
		static lc_name(): string {
			return knowledgebaseId
		}
		constructor(queryBus: QueryBus, knowledgebaseId: string, options?: TKBRecallParams) {
			super(queryBus, knowledgebaseId, options)
		}
	}
	return new DynamicKnowledgeRetriever(queryBus, knowledgebaseId, options) as KnowledgeRetriever
}
