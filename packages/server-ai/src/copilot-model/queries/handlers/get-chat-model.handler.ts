import { omit } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { AIModelGetProviderQuery, ModelProvider } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotCheckLimitCommand, CopilotTokenRecordCommand } from '../../../copilot-user'
import { CopilotModelNotFoundException } from '../../../core/errors'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'

@QueryHandler(CopilotModelGetChatModelQuery)
export class CopilotModelGetChatModelHandler implements IQueryHandler<CopilotModelGetChatModelQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CopilotModelGetChatModelQuery) {
		const { abortController, usageCallback } = command.options ?? {}
		const copilot = command.copilot
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()

		// Check token limit
		await this.commandBus.execute(
			new CopilotCheckLimitCommand({
				tenantId,
				organizationId,
				userId,
				copilot
			})
		)

		const copilotModel = command.copilotModel ?? copilot.copilotModel
		if (!copilotModel) {
			throw new CopilotModelNotFoundException(`No AI model provided`)
		}
		const modelName = copilotModel.model
		// Custom model
		const customModels = await this.queryBus.execute(
			new GetCopilotProviderModelQuery(copilot.modelProvider.id, modelName)
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
								model: input.model
							})
						)
					} catch (err) {
						if (abortController && !abortController.signal.aborted) {
							try {
								abortController.abort(err.message)
							} catch (err) {
								//
							}
						}
					}
				}
			}
		)
	}
}
