import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotModelGetEmbeddingsQuery } from '../get-embeddings.query'
import { AiModelTypeEnum, ILLMUsage } from '@metad/contracts'
import { CopilotModelInvalidException } from '../../../core/errors'

@QueryHandler(CopilotModelGetEmbeddingsQuery)
export class CopilotModelGetEmbeddingsHandler implements IQueryHandler<CopilotModelGetEmbeddingsQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CopilotModelGetEmbeddingsQuery) {

		const copilotModel = command.copilotModel ?? command.copilot.copilotModel
		if (copilotModel?.modelType !== AiModelTypeEnum.TEXT_EMBEDDING) {
			throw new CopilotModelInvalidException(`Should select a text embedding model, current is '${copilotModel?.model}: ${copilotModel?.modelType}'`)
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
