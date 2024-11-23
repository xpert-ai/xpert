import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotModelGetEmbeddingsQuery } from '../get-embeddings.query'

@QueryHandler(CopilotModelGetEmbeddingsQuery)
export class CopilotModelGetEmbeddingsHandler implements IQueryHandler<CopilotModelGetEmbeddingsQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CopilotModelGetEmbeddingsQuery) {
		// Temporarily the same logic as `CopilotModelGetChatModelQuery`
		return await this.queryBus.execute(
			new CopilotModelGetChatModelQuery(command.copilot, command.copilotModel ?? command.copilot.copilotModel, command.options)
		)
	}
}
