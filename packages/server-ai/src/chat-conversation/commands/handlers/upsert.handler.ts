import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationUpsertCommand } from '../upsert.command'
import { ChatConversation } from '../../conversation.entity'
import { applicationTracing } from '../../../tracing'
import { ForbiddenException } from '@nestjs/common'

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
                    // Upsert is a broad mutation path, so enforce the same
                    // conversation Project immutability as the dedicated command.
                    if (Object.prototype.hasOwnProperty.call(entity, 'projectId')) {
                        const existing = await this.service.repository.findOne({
                            where: { id },
                            select: { id: true, projectId: true }
                        })
                        if (existing && existing.projectId !== entity.projectId) {
                            throw new ForbiddenException('A conversation cannot be moved to another Project')
                        }
                    }
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
