import { CallbackManager } from '@langchain/core/callbacks/manager'
import { Document, DocumentInterface } from '@langchain/core/documents'
import { BaseRetriever } from '@langchain/core/retrievers'
import { ensureConfig, RunnableConfig } from '@langchain/core/runnables'
import { Logger } from '@nestjs/common'
import { SemanticModelMemberService } from './member.service'

export class DimensionMemberRetriever extends BaseRetriever {
	readonly #logger = new Logger(DimensionMemberRetriever.name)
	lc_namespace = ['dimension', 'members', 'retriever']

	modelId: string
	cube: string

	constructor(
		private readonly memberService: SemanticModelMemberService,
		public tenantId?: string,
		public organizationId?: string
	) {
		super()
	}

	async invoke(query: string, options?: RunnableConfig): Promise<DocumentInterface<Record<string, any>>[]> {
		this.#logger.debug(`Retrieving dimension members for query: ${query} in cube '${this.cube}'`)
		const modelId = this.modelId ?? ''
		const cube = this.cube
		const dimension = options?.configurable?.dimension
		const hierarchy = options?.configurable?.hierarchy
		const level = options?.configurable?.level
		const topK = options?.configurable?.topK

		const parsedConfig = ensureConfig(options)
		const callbackManager_ = await CallbackManager.configure(
			parsedConfig.callbacks,
			this.callbacks,
			parsedConfig.tags,
			this.tags,
			parsedConfig.metadata,
			this.metadata,
			{ verbose: this.verbose }
		)
		const runManager = await callbackManager_?.handleRetrieverStart(
			this.toJSON(),
			query,
			parsedConfig.runId,
			undefined,
			undefined,
			undefined,
			parsedConfig.runName
		)
		try {
			const docs = await this.memberService.retrieveMembers(
				this.tenantId,
				this.organizationId,
				{ modelId, cube, dimension, hierarchy, level },
				query,
				topK ?? 10
			)

			this.#logger.debug(`Retrieved dimension members: ${docs.length}`)
			const results = docs.map((item) => new Document(item))
			await runManager?.handleRetrieverEnd(results)
			return results
		} catch (error) {
			await runManager?.handleRetrieverError(error)
			throw error
		}
	}
}

export function createDimensionMemberRetriever(context: { logger: Logger }, service: SemanticModelMemberService) {
	return new DimensionMemberRetriever(service)
}
