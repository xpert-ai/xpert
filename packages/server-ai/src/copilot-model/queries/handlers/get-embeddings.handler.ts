import { AiModelTypeEnum, ILLMUsage, mapTranslationLanguage } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotModelInvalidException } from '../../../core/errors'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotModelGetEmbeddingsQuery } from '../get-embeddings.query'

@QueryHandler(CopilotModelGetEmbeddingsQuery)
export class CopilotModelGetEmbeddingsHandler implements IQueryHandler<CopilotModelGetEmbeddingsQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CopilotModelGetEmbeddingsQuery) {
		const copilotModel = command.copilotModel ?? command.copilot.copilotModel
		if (copilotModel?.modelType !== AiModelTypeEnum.TEXT_EMBEDDING) {
			throw new CopilotModelInvalidException(
				await this.i18nService.t('copilot.Error.NoTextEmbeddingModel', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}

		// Temporarily the same logic as `CopilotModelGetChatModelQuery`
		return await this.queryBus.execute(
			new CopilotModelGetChatModelQuery(command.copilot, copilotModel, {
				...command.options,
				usageCallback: (usage: ILLMUsage) => {
					//
				}
			})
		)
	}
}
