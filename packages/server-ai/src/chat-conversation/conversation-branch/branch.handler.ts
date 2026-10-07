import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ConversationBranchCommand } from './branch.command'
import { ConversationBranchService } from './conversation-branch.service'

@CommandHandler(ConversationBranchCommand)
export class ConversationBranchHandler implements ICommandHandler<ConversationBranchCommand> {
    constructor(private readonly branches: ConversationBranchService) {}

    execute({ conversationId, input }: ConversationBranchCommand) {
        return this.branches.branch(conversationId, input)
    }
}
