import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { AgentStateAnnotation, STATE_VARIABLE_PENDING_FOLLOW_UPS } from '../../../shared'
import { TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { CreateNodeStagePendingSteerFollowUpsCommand } from '../create-node-stage-pending-steer-follow-ups.command'
import { readFollowUpClientMessageId, readPersistedFollowUpInput } from './create-node-pending-steer-follow-ups.shared'

@CommandHandler(CreateNodeStagePendingSteerFollowUpsCommand)
export class CreateNodeStagePendingSteerFollowUpsHandler
    implements ICommandHandler<CreateNodeStagePendingSteerFollowUpsCommand>
{
    constructor(
        @InjectRepository(ChatMessage)
        private readonly chatMessageRepository: Repository<ChatMessage>
    ) {}

    async execute(command: CreateNodeStagePendingSteerFollowUpsCommand) {
        const { conversationId } = command.input

        return new RunnableLambda({
            func: async (
                _state: typeof AgentStateAnnotation.State,
                config?: RunnableConfig
            ): Promise<Partial<typeof AgentStateAnnotation.State>> => {
                const configurable = (config?.configurable ?? {}) as Partial<TAgentRunnableConfigurable>
                const targetExecutionId = configurable.rootExecutionId ?? configurable.executionId

                if (!conversationId || !targetExecutionId) {
                    return {
                        [STATE_VARIABLE_PENDING_FOLLOW_UPS]: []
                    }
                }

                const pendingMessages = await this.chatMessageRepository.find({
                    where: {
                        conversationId,
                        targetExecutionId,
                        followUpMode: 'steer',
                        followUpStatus: 'pending'
                    },
                    relations: ['attachments'],
                    order: {
                        createdAt: 'ASC'
                    }
                })

                return {
                    [STATE_VARIABLE_PENDING_FOLLOW_UPS]: pendingMessages
                        .filter((message): message is ChatMessage & { id: string } => Boolean(message.id))
                        .map((message) => ({
                            messageId: message.id,
                            clientMessageId: readFollowUpClientMessageId(message),
                            human: readPersistedFollowUpInput(message)
                        }))
                }
            }
        })
    }
}
