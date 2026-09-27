import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { bindEmptyConversationProject } from '../../bind-empty-conversation-project'
import { ChatConversationBindProjectCommand } from '../bind-project.command'

@CommandHandler(ChatConversationBindProjectCommand)
export class ChatConversationBindProjectHandler implements ICommandHandler<ChatConversationBindProjectCommand> {
    constructor(private readonly service: ChatConversationService) {}

    public execute(command: ChatConversationBindProjectCommand) {
        return bindEmptyConversationProject(this.service.repository, command.conversationId, command.projectId)
    }
}
