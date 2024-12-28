import { DynamicStructuredTool } from '@langchain/core/tools'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CopilotKnowledgeService } from '../../copilot-knowledge.service'
import { createReferencesRetrieverTool } from '../../references-retriever'
import { CreateCopilotKnowledgeRetrieverCommand } from '../create-retriever.command'

@CommandHandler(CreateCopilotKnowledgeRetrieverCommand)
export class CreateCopilotKnowledgeRetrieverHandler implements ICommandHandler<CreateCopilotKnowledgeRetrieverCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: CopilotKnowledgeService
	) {}

	public async execute(command: CreateCopilotKnowledgeRetrieverCommand): Promise<DynamicStructuredTool> {
		return createReferencesRetrieverTool(this.service, command.options)
	}
}
