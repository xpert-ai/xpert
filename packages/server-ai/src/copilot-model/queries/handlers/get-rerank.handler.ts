import { AiModelTypeEnum, mapTranslationLanguage } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { AIModelGetProviderQuery, ModelProvider } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotModelInvalidException } from '../../../core/errors'
import { CopilotModelGetRerankQuery } from '../get-rerank.query'

@QueryHandler(CopilotModelGetRerankQuery)
export class CopilotModelGetRerankHandler implements IQueryHandler<CopilotModelGetRerankQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CopilotModelGetRerankQuery) {
		const copilotModel = command.copilotModel ?? command.copilot.copilotModel
		if (copilotModel?.modelType !== AiModelTypeEnum.RERANK) {
			throw new CopilotModelInvalidException(
				await this.i18nService.t('copilot.Error.NoRerankModel', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}

		const copilot = command.copilot
		const modelName = copilotModel.model
		// Custom model
		const customModels = await this.queryBus.execute(
			new GetCopilotProviderModelQuery(copilot.modelProvider.id, { modelName })
		)

		const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, ModelProvider>(
			new AIModelGetProviderQuery(copilot.modelProvider.providerName)
		)

		return modelProvider.getModelInstance(
			copilotModel.modelType,
			{
				...copilotModel,
				copilot
			},
			{
				verbose: Logger.isLevelEnabled('verbose'),
				modelProperties: customModels[0]?.modelProperties,
				handleLLMTokens: (input) => {
					//
				}
			}
		)
	}
}
