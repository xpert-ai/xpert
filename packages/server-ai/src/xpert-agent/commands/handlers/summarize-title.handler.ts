import { RunnableConfig } from '@langchain/core/runnables'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CreateSummarizeTitleAgentCommand } from '../summarize-title.command'
import { AgentStateAnnotation, ConversationTitleService } from '../../../shared'

@CommandHandler(CreateSummarizeTitleAgentCommand)
export class CreateSummarizeTitleAgentHandler implements ICommandHandler<CreateSummarizeTitleAgentCommand> {
    constructor(private readonly conversationTitleService: ConversationTitleService) {}

    public async execute(command: CreateSummarizeTitleAgentCommand) {
        const { channel, copilot, xpert } = command.options

        return async (state: typeof AgentStateAnnotation.State, config: RunnableConfig) =>
            this.conversationTitleService.generateStatePatch({
                channel,
                config,
                copilot,
                state,
                xpert
            })
    }
}
