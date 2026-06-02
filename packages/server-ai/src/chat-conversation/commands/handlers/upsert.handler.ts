import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationUpsertCommand } from '../upsert.command'
import { ChatConversation } from '../../conversation.entity'
import { applicationTracing } from '../../../tracing'

@CommandHandler(ChatConversationUpsertCommand)
export class ChatConversationUpsertHandler implements ICommandHandler<ChatConversationUpsertCommand> {
    constructor(
        private readonly service: ChatConversationService,
        private readonly commandBus: CommandBus
    ) {}

    public async execute(command: ChatConversationUpsertCommand): Promise<ChatConversation> {
        return applicationTracing.traceAsync(
            'conversation.upsert',
            {
                'conversation.id': command.entity.id,
                'conversation.status': command.entity.status,
                'conversation.operation': command.entity.id ? 'update' : 'create'
            },
            async () => {
                const entity = command.entity

                let id = entity.id
                if (id) {
                    await this.service.save(entity as ChatConversation)
                } else {
                    const newEntity = await this.service.create(entity)
                    id = newEntity.id
                }
                return await this.service.findOne(id, { relations: command.relations })
            }
        )
    }
}
