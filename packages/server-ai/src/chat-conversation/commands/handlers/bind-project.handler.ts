import { ForbiddenException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IsNull } from 'typeorm'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationBindProjectCommand } from '../bind-project.command'

@CommandHandler(ChatConversationBindProjectCommand)
export class ChatConversationBindProjectHandler implements ICommandHandler<ChatConversationBindProjectCommand> {
    constructor(private readonly service: ChatConversationService) {}

    public async execute(command: ChatConversationBindProjectCommand) {
        // Compare-and-set preserves immutability under concurrent first-run
        // requests without taking an application-level lock.
        await this.service.repository.update(
            {
                id: command.conversationId,
                projectId: IsNull()
            },
            {
                projectId: command.projectId
            }
        )

        const conversation = await this.service.repository.findOneByOrFail({ id: command.conversationId })
        // A failed compare-and-set means another request already chose a scope.
        if (conversation.projectId !== command.projectId) {
            throw new ForbiddenException('A conversation cannot be moved to another Project')
        }
        return conversation
    }
}
