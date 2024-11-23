import { RequestContext } from '@metad/server-core'
import { CommandBus, IQueryHandler, QueryHandler, QueryBus } from '@nestjs/cqrs'
import { CopilotCheckLimitCommand, CopilotTokenRecordCommand } from '../../../copilot-user'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { ModelProvider, AIModelGetProviderQuery } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'

@QueryHandler(CopilotModelGetChatModelQuery)
export class CopilotModelGetChatModelHandler implements IQueryHandler<CopilotModelGetChatModelQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	public async execute(command: CopilotModelGetChatModelQuery) {
		const { abortController, tokenCallback } = command.options ?? {}
		const copilot = command.copilot
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()

		// Check token limit
		await this.commandBus.execute(new CopilotCheckLimitCommand({
			tenantId,
			organizationId,
			userId,
			copilot
		}))

        const copilotModel = command.copilotModel ?? copilot.copilotModel
        const modelName = copilotModel.model
        // Custom model
        const customModels = await this.queryBus.execute(new GetCopilotProviderModelQuery(copilot.modelProvider.id, modelName))
		
		const modelProvider = await this.queryBus.execute<AIModelGetProviderQuery, ModelProvider>(new AIModelGetProviderQuery(copilot.modelProvider.providerName))

		return modelProvider.getModelInstance(
			copilotModel.modelType,
			{
				...copilotModel,
				copilot
			},
			{
				modelProperties: customModels[0]?.modelProperties,
				handleLLMTokens: async (input) => {
					if (tokenCallback) {
						tokenCallback(input.tokenUsed)
					}
					// Record token usage and abort if error
					try {
						await this.commandBus.execute(
							new CopilotTokenRecordCommand({
								...input,
								tenantId,
								organizationId,
								userId,
								copilot
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
