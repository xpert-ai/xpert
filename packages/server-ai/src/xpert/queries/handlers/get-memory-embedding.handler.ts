import { Embeddings } from '@langchain/core/embeddings'
import { AiProviderRole, ICopilot, IXpert, mapTranslationLanguage } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotModelGetEmbeddingsQuery } from '../../../copilot-model'
import { CopilotGetOneQuery, CopilotOneByRoleQuery } from '../../../copilot/queries'
import { CopilotNotFoundException } from '../../../core/errors'
import { GetXpertMemoryEmbeddingsQuery } from '../get-memory-embedding.query'

@QueryHandler(GetXpertMemoryEmbeddingsQuery)
export class GetXpertMemoryEmbeddingsHandler implements IQueryHandler<GetXpertMemoryEmbeddingsQuery> {
	constructor(
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: GetXpertMemoryEmbeddingsQuery): Promise<IXpert> {
		const { tenantId, organizationId, memory } = command
		let copilot: ICopilot = null
		if (memory?.copilotModel?.copilotId) {
			copilot = await this.queryBus.execute(
				new CopilotGetOneQuery(tenantId, memory.copilotModel.copilotId, ['copilotModel', 'modelProvider'])
			)
		} else {
			copilot = await this.queryBus.execute(
				new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding, [
					'copilotModel',
					'modelProvider'
				])
			)
		}

		if (!copilot?.enabled) {
			throw new CopilotNotFoundException(
				await this.i18nService.t('xpert.Error.EmbeddingCopilotNotFound', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}

		let embeddings = null
		const copilotModel = memory?.copilotModel ?? copilot.copilotModel
		if (copilotModel && copilot?.modelProvider) {
			embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
				new CopilotModelGetEmbeddingsQuery(copilot, copilotModel, command.options)
			)
		}

		return embeddings
	}
}
