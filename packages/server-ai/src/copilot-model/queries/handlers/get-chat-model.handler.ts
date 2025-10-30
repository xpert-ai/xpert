import { mapTranslationLanguage } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { AIModelGetProviderQuery, ModelProvider } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotCheckLimitCommand, CopilotTokenRecordCommand } from '../../../copilot-user'
import { CopilotModelNotFoundException, ExceedingLimitException } from '../../../core/errors'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotGetOneQuery } from '../../../copilot/queries'

@QueryHandler(CopilotModelGetChatModelQuery)
export class CopilotModelGetChatModelHandler implements IQueryHandler<CopilotModelGetChatModelQuery> {
	readonly #logger = new Logger(CopilotModelGetChatModelHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CopilotModelGetChatModelQuery) {
		const { abortController, usageCallback } = command.options ?? {}
		let copilot = command.copilot
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()

		const copilotModel = command.copilotModel ?? copilot?.copilotModel
		if (!copilotModel) {
			throw new CopilotModelNotFoundException(
				this.i18nService.t('copilot.Error.AIModelNotFound', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}
		const modelName = copilotModel.model

		if (!copilot) {
			copilot = await this.queryBus.execute(new CopilotGetOneQuery(tenantId, copilotModel.copilotId, ['modelProvider']))
		}

		// Check token limit
		await this.commandBus.execute(
			new CopilotCheckLimitCommand({
				tenantId,
				organizationId,
				userId,
				copilot,
				model: modelName
			})
		)

		// Custom model
		const customModels = await this.queryBus.execute(
			new GetCopilotProviderModelQuery(copilot.modelProvider.id, {modelName})
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
				handleLLMTokens: async (input) => {
					if (usageCallback && input.usage) {
						usageCallback(input.usage)
					}

					// Record token usage and abort if error
					try {
						await this.commandBus.execute(
							new CopilotTokenRecordCommand({
								...omit(input, 'usage'),
								tenantId,
								organizationId,
								userId,
								copilot,
								model: input.model,
								tokenUsed: input.usage?.totalTokens,
								priceUsed: input.usage?.totalPrice,
								currency: input.usage?.currency
							})
						)
					} catch (err) {
						if (err instanceof ExceedingLimitException) {
							if (abortController && !abortController.signal.aborted) {
								try {
									abortController.abort(err.message)
								} catch (err) {
									//
								}
							}
						} else {
							this.#logger.error(err)
						}
					}
				}
			}
		)
	}
}
