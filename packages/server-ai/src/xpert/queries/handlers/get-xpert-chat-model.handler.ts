import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ICopilot } from '@metad/contracts'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotGetOneQuery } from '../../../copilot'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { XpertCopilotNotFoundException } from '../../../core/errors'
import { GetXpertChatModelQuery } from '../get-xpert-chat-model.query'

@QueryHandler(GetXpertChatModelQuery)
export class GetXpertChatModelQueryHandler implements IQueryHandler<GetXpertChatModelQuery> {
	constructor(
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: GetXpertChatModelQuery) {
		const { xpert, agent, options } = command
		const { tenantId } = xpert

		const copilotModel = options?.copilotModel ?? agent?.copilotModel ?? xpert.copilotModel

		let copilot: ICopilot = null
		const copilotId = copilotModel?.copilotId ?? xpert.copilotModel?.copilotId
		if (copilotId) {
			copilot = await this.queryBus.execute(new CopilotGetOneQuery(tenantId, copilotId, ['modelProvider']))
		} else {
			throw new XpertCopilotNotFoundException(`Xpert copilot not found for '${xpert.name}'`)
		}

		return await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(copilot, copilotModel, options)
		)
	}
}
