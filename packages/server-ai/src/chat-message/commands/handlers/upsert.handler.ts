import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatMessageUpsertCommand } from '../upsert.command'
import { ChatMessageService } from '../../chat-message.service'
import { ChatMessage } from '../../chat-message.entity'
import { applicationTracing } from '../../../tracing'
import { extractChatMessageTaskSummary } from '../../task-summary'
import type { IChatMessage } from '@xpert-ai/contracts'

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

                const saved = entity.id
                    ? await this.service.save(entity as ChatMessage)
                    : await this.service.create(entity)

                if (!this.shouldExtractTaskSummary(entity)) {
                    return saved
                }

                const message = await this.service.findOneInOrganizationOrTenant(saved.id, {
                    select: ['id', 'content', 'references', 'thirdPartyMessage', 'createdAt', 'updatedAt'],
                    relations: ['attachments', 'fileAssets']
                })
                const taskSummary = extractChatMessageTaskSummary({
                    ...message,
                    taskSummary: entity.taskSummary
                })
                await this.service.save({ id: saved.id, taskSummary } as ChatMessage)
                saved.taskSummary = taskSummary
                return saved
            }
        )
    }

    private shouldExtractTaskSummary(entity: Partial<IChatMessage>) {
        return (
            !entity.id ||
            entity.content !== undefined ||
            entity.references !== undefined ||
            entity.fileAssets !== undefined ||
            entity.attachments !== undefined ||
            entity.thirdPartyMessage !== undefined ||
            entity.taskSummary !== undefined
        )
    }
}
