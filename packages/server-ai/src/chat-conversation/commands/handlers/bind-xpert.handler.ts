import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IsNull } from 'typeorm'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationBindXpertCommand } from '../bind-xpert.command'

@CommandHandler(ChatConversationBindXpertCommand)
export class ChatConversationBindXpertHandler implements ICommandHandler<ChatConversationBindXpertCommand> {
    constructor(private readonly service: ChatConversationService) {}

    public async execute(command: ChatConversationBindXpertCommand) {
        await this.service.update(
            {
                id: command.conversationId,
                xpertId: IsNull()
            },
            {
                xpertId: command.xpertId
            }
        )

        return this.service.findOne(command.conversationId)
    }
}
