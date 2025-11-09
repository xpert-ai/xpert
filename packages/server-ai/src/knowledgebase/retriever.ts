import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager'
import { Document, DocumentInterface } from '@langchain/core/documents'
import { BaseRetriever } from '@langchain/core/retrievers'
import { ChatMessageEventTypeEnum, DocumentMetadata, TKBRecallParams, TKBRetrievalSettings } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { omit } from 'lodash'
import z from 'zod'
import { DocumentChunkDTO } from '../knowledge-document/dto'
import { KnowledgebaseGetOneQuery, KnowledgeSearchQuery } from './queries'


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
		private readonly options?: {
			recall: TKBRecallParams
			retrieval?: TKBRetrievalSettings
		}
	) {
		super()
	}

	async _getRelevantDocuments(query: string, runManager?: CallbackManagerForRetrieverRun): Promise<Document[]> {
		this.#logger.debug(`Retrieving knowledge documents for query: ${query}`)
		return this.retrieve(query)
		// this.metadata.knowledgebaseId = this.knowledgebaseId

		// try {
		// 	const results = await this.queryBus.execute<KnowledgeSearchQuery, DocumentInterface<DocumentMetadata>[]>(
		// 		new KnowledgeSearchQuery({
		// 			tenantId: this.tenantId,
		// 			organizationId: this.organizationId,
		// 			knowledgebases: this.knowledgebaseId ? [this.knowledgebaseId] : [],
		// 			query,
		// 			score: this.options?.recall.score,
		// 			k: this.options?.recall.topK,
		// 			source: 'retriever'
		// 		})
		// 	)
		// 	return results.map(
		// 		(doc) =>
		// 			instanceToPlain(
		// 				new DocumentChunkDTO({ ...doc, metadata: omit(doc.metadata, 'children') })
		// 			) as Document
		// 	)
		// } catch (error) {
		// 	await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR, {
		// 		knowledgebaseId: this.knowledgebaseId,
		// 		error: getErrorMessage(error)
		// 	})
		// 	throw error
		// }
	}

	async retrieve(query: string, filter?: Record<string, any>): Promise<Document[]> {
		this.metadata.knowledgebaseId = this.knowledgebaseId

		try {
			const results = await this.queryBus.execute<KnowledgeSearchQuery, DocumentInterface<DocumentMetadata>[]>(
				new KnowledgeSearchQuery({
					tenantId: this.tenantId,
					organizationId: this.organizationId,
					knowledgebases: this.knowledgebaseId ? [this.knowledgebaseId] : [],
					query,
					score: this.options?.recall.score,
					k: this.options?.recall.topK,
					source: 'retriever',
					filter
				})
			)
			return results.map(
				(doc) =>
					instanceToPlain(
						new DocumentChunkDTO({ ...doc, metadata: omit(doc.metadata, 'children') })
					) as Document
			)
		} catch (error) {
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR, {
				knowledgebaseId: this.knowledgebaseId,
				error: getErrorMessage(error)
			})
			throw error
		}
	}

	async toTool(toolOptions?: { name?: string; description?: string }) {
		const retrieval = this.options?.retrieval
		/**
		 * retrieval is:
		 * {
			  metadata: {
				filtering_mode: 'automatic',
				fields: { new_field_0: {}, originalFileName: {}, originalFileSize: {} }
			  }
			}
		 */
		const knowledgebase = await this.queryBus.execute(new KnowledgebaseGetOneQuery({id: this.knowledgebaseId, options: {
							select: {
								id: true,
								name: true,
								description: true,
								metadataSchema: true
							}
						}}))
		const schema: Record<string, z.ZodOptional<z.ZodTypeAny>> = {}
		if (retrieval?.metadata?.filtering_mode === 'automatic') {
			const filteringMetadataFields = retrieval.metadata?.fields
			const filteringFields = Object.keys(filteringMetadataFields).map((field) => knowledgebase.metadataSchema?.find((_) => _.key === field))
			for (const field of filteringFields) {
				if (field) {
					switch (field.type) {
						case 'string':
							schema[field.key] = z.string().optional().describe(field.description || `Metadata field: ${field.key}`)
							break
						case 'number':
							schema[field.key] = z.number().optional().describe(field.description || `Metadata field: ${field.key}`)
							break
						case 'boolean':
							schema[field.key] = z.boolean().optional().describe(field.description || `Metadata field: ${field.key}`)
							break
						default:
							schema[field.key] = z.any().optional().describe(field.description || `Metadata field: ${field.key}`)
					}
				}
			}
		}
		return tool(async (params) => {
			return this.retrieve(params.input, omit(params, 'input'))
		}, {
			...toolOptions,
			name: toolOptions?.name ?? `retriever-${this.knowledgebaseId}`,
			description: `Get knowledges from knowledgebase '${knowledgebase.name}', it be described by ` + knowledgebase.description,
			schema: z.object({
				...schema,
				input: z.string().describe(`key information of question`)
			})
		})
	}
}

export function createKnowledgeRetriever(
	queryBus: QueryBus,
	knowledgebaseId: string,
	options?: {
		recall: TKBRecallParams
		retrieval?: TKBRetrievalSettings
	}
) {
	class DynamicKnowledgeRetriever extends KnowledgeRetriever {
		// To enable langchain to obtain the actual knowledgebaseId of the Retriever as the event name
		static lc_name(): string {
			return knowledgebaseId
		}
		constructor(
			queryBus: QueryBus,
			knowledgebaseId: string,
			options?: {
				recall: TKBRecallParams
				retrieval?: TKBRetrievalSettings
			}
		) {
			super(queryBus, knowledgebaseId, options)
		}
	}
	return new DynamicKnowledgeRetriever(queryBus, knowledgebaseId, options) as KnowledgeRetriever
}
