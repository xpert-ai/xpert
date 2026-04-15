import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import {
    channelName,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    createFollowUpConsumedEvent,
    STATE_VARIABLE_HUMAN,
    TAgentRunnableConfigurable,
    STATE_VARIABLE_SYS
} from '@xpert-ai/contracts'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import {
    AgentStateAnnotation,
    createHumanMessage,
    STATE_VARIABLE_PENDING_FOLLOW_UPS,
    TPendingFollowUpStateItem
} from '../../../shared'
import { CreateNodeConsumePendingSteerFollowUpsCommand } from '../create-node-consume-pending-steer-follow-ups.command'
import { mergePendingFollowUpHumans } from './create-node-pending-steer-follow-ups.shared'

@CommandHandler(CreateNodeConsumePendingSteerFollowUpsCommand)
export class CreateNodeConsumePendingSteerFollowUpsHandler
    implements ICommandHandler<CreateNodeConsumePendingSteerFollowUpsCommand>
{
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        @InjectRepository(ChatMessage)
        private readonly chatMessageRepository: Repository<ChatMessage>
    ) {}

    async execute(command: CreateNodeConsumePendingSteerFollowUpsCommand) {
        const { agentKey, agentChannel, subscriber, attachmentOptions } = command.input

        return new RunnableLambda({
            func: async (
                state: typeof AgentStateAnnotation.State,
                config?: RunnableConfig
            ): Promise<Partial<typeof AgentStateAnnotation.State>> => {
                if (Array.isArray((state as any).tasks) && (state as any).tasks.length) {
                    return {
                        [STATE_VARIABLE_PENDING_FOLLOW_UPS]: []
                    }
                }

                const pendingFollowUps = (state[STATE_VARIABLE_PENDING_FOLLOW_UPS] ?? []) as TPendingFollowUpStateItem[]
                if (!pendingFollowUps.length) {
                    return {
                        [STATE_VARIABLE_PENDING_FOLLOW_UPS]: []
                    }
                }

                const mergedHumanInput = mergePendingFollowUpHumans(pendingFollowUps)
                const humanState = {
                    ...state,
                    [STATE_VARIABLE_HUMAN]: mergedHumanInput
                }
                const humanMessage = await createHumanMessage(
                    this.commandBus,
                    this.queryBus,
                    humanState,
                    attachmentOptions
                )
                const configurable = (config?.configurable ?? {}) as Partial<TAgentRunnableConfigurable>
                const rootAgentKey = configurable.rootAgentKey ?? agentKey
                const primaryChannel = rootAgentKey ? channelName(rootAgentKey) : agentChannel
                const visibleAt = new Date()
                const messageIds = pendingFollowUps
                    .map((item) => item.messageId)
                    .filter((messageId): messageId is string => Boolean(messageId))
                const clientMessageIds = pendingFollowUps
                    .map((item) => item.clientMessageId ?? item.messageId)
                    .filter((messageId): messageId is string => Boolean(messageId))

                if (messageIds.length) {
                    await this.chatMessageRepository.save(
                        messageIds.map((id) => ({
                            id,
                            followUpStatus: 'consumed' as const,
                            visibleAt
                        }))
                    )
                }

                const consumedEvent = createFollowUpConsumedEvent({
                    mode: 'steer',
                    messageIds,
                    clientMessageIds,
                    executionId: configurable.rootExecutionId ?? configurable.executionId,
                    visibleAt: visibleAt.toISOString()
                })

                subscriber?.next({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                        data: consumedEvent
                    }
                } as MessageEvent)

                const channelUpdate = {
                    messages: [humanMessage]
                }

                return {
                    input: typeof mergedHumanInput.input === 'string' ? mergedHumanInput.input : '',
                    messages: [humanMessage],
                    [STATE_VARIABLE_SYS]: state[STATE_VARIABLE_SYS],
                    [STATE_VARIABLE_HUMAN]: mergedHumanInput,
                    [STATE_VARIABLE_PENDING_FOLLOW_UPS]: [],
                    [primaryChannel]: channelUpdate,
                    ...(agentChannel !== primaryChannel
                        ? {
                              [agentChannel]: channelUpdate
                          }
                        : {})
                } satisfies Partial<typeof AgentStateAnnotation.State>
            }
        })
    }
}
