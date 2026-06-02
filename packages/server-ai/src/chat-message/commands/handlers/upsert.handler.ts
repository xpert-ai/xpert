import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatMessageUpsertCommand } from '../upsert.command'
import { ChatMessageService } from '../../chat-message.service'
import { ChatMessage } from '../../chat-message.entity'
import { applicationTracing } from '../../../tracing'

@CommandHandler(ChatMessageUpsertCommand)
export class ChatMessageUpsertHandler implements ICommandHandler<ChatMessageUpsertCommand> {
    constructor(
        private readonly service: ChatMessageService,
        private readonly commandBus: CommandBus
    ) {}

    public async execute(command: ChatMessageUpsertCommand): Promise<ChatMessage> {
        return applicationTracing.traceAsync(
            'message.persist',
            {
                'message.id': command.entity.id,
                'message.role': command.entity.role,
                'message.status': command.entity.status,
                'conversation.id': command.entity.conversationId,
                'execution.id': command.entity.executionId,
                'message.operation': command.entity.id ? 'update' : 'create'
            },
            async () => {
                const entity = command.entity

                if (entity.id) {
                    return await this.service.save(entity as ChatMessage)
                }
                return await this.service.create(entity)
            }
        )
    }
}
