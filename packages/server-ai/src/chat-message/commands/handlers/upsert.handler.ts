import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatMessageUpsertCommand } from '../upsert.command'
import { ChatMessageService } from '../../chat-message.service'
import { ChatMessage } from '../../chat-message.entity'

@CommandHandler(ChatMessageUpsertCommand)
export class ChatMessageUpsertHandler implements ICommandHandler<ChatMessageUpsertCommand> {
    constructor(
        private readonly service: ChatMessageService,
        private readonly commandBus: CommandBus
    ) {}

    public async execute(command: ChatMessageUpsertCommand): Promise<ChatMessage> {
        const entity = command.entity

        if (entity.id) {
            return await this.service.save(entity as ChatMessage)
        }
        return await this.service.create(entity)
    }
}
