import { RunnableLambda } from '@langchain/core/runnables'
import { BaseStore } from '@langchain/langgraph'
import {
    appendMessageContent,
    appendMessagePlainText,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    CopilotChatMessage,
    createMessageAppendContextTracker,
    figureOutXpert,
    IChatConversation,
    IChatMessage,
    IStorageFile,
    IXpert,
    LongTermMemoryTypeEnum,
    shortTitle,
    STATE_VARIABLE_HUMAN,
    TChatConversationStatus,
    TChatRequestHuman,
    TSensitiveOperation,
    XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { catchError, concat, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { uniq } from 'lodash'
import {
    CancelSummaryJobCommand,
    ChatConversationUpsertCommand,
    GetChatConversationQuery,
    ScheduleSummaryJobCommand
} from '../../../chat-conversation/'
import { appendMessageSteps, ChatMessageUpsertCommand } from '../../../chat-message'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentChatCommand } from '../../../xpert-agent/'
import { XpertService } from '../../xpert.service'
import { XpertChatCommand } from '../chat.command'
import { CreateMemoryStoreCommand } from '../../../shared'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution'
import { CopilotCheckpointService } from '../../../copilot-checkpoint'

@CommandHandler(XpertChatCommand)
export class XpertChatHandler implements ICommandHandler<XpertChatCommand> {
    readonly #logger = new Logger(XpertChatHandler.name)

    constructor(
        private readonly xpertService: XpertService,
        private readonly checkpointService: CopilotCheckpointService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(c: XpertChatCommand): Promise<Observable<MessageEvent>> {
        const { options } = c
        const { projectId, conversationId, confirm, retry, command } = c.request
        let { input, state } = c.request
        const { xpertId, taskId, from, fromEndUserId } = options ?? {}
        let { execution } = options ?? {}
        const userId = RequestContext.currentUserId()

        if (!input) {
            input = state?.[STATE_VARIABLE_HUMAN]
        }
        if (!state) {
            state = { [STATE_VARIABLE_HUMAN]: input }
        }

        const timeStart = Date.now()

        const xpert = await this.xpertService.findOne(xpertId, { relations: ['agent', 'knowledgebase'] })
        const latestXpert = figureOutXpert(xpert, options?.isDraft)
        const abortController = new AbortController()
        const memory = latestXpert.memory
        const memoryStore: BaseStore | null = await this.commandBus.execute<CreateMemoryStoreCommand, BaseStore | null>(
            new CreateMemoryStoreCommand(
                RequestContext.currentTenantId(),
                RequestContext.getOrganizationId(),
                latestXpert.memory?.copilotModel,
                {
                    abortController,
                    tokenCallback: (tokens: number) => {
                        //
                    }
                }
            )
        )

        let memories = null

        let conversation: IChatConversation
        let aiMessage: CopilotChatMessage
        let executionId: string
        let checkpointId: string = null
        // Retry takes priority over confirm/command to avoid being hijacked
        if (!retry && (confirm || command)) {
            // Continue thread when confirm or reject operation
            conversation = await this.queryBus.execute(
                new GetChatConversationQuery({ id: conversationId }, ['messages'])
            )
            conversation.status = 'busy'
            aiMessage = conversation.messages[conversation.messages.length - 1] as CopilotChatMessage
            executionId = aiMessage.executionId

            // Cancel summary job
            if (memory?.enabled && memory.profile?.enabled) {
                await this.commandBus.execute(new CancelSummaryJobCommand(conversation.id))
            }
        } else {
            // New message or retry in conversation
            if (conversationId) {
                conversation = await this.commandBus.execute(
                    new ChatConversationUpsertCommand(
                        {
                            id: conversationId,
                            status: 'busy',
                            error: null
                        },
                        ['messages']
                    )
                )

                // Cancel summary job
                if (memory?.enabled && memory.profile?.enabled) {
                    await this.commandBus.execute(new CancelSummaryJobCommand(conversation.id))
                }
            } else {
                // New conversation
                conversation = await this.commandBus.execute(
                    new ChatConversationUpsertCommand(
                        {
                            status: 'busy',
                            projectId,
                            taskId,
                            xpert,
                            options: {
                                parameters: input
                            },
                            from,
                            fromEndUserId
                        },
                        ['messages']
                    )
                )

                // Remember
                if (memory?.enabled && memory.profile?.enabled && memoryStore) {
                    memories = await getLongTermMemory(memoryStore, xpertId, input.input)
                }
            }

            // New execution (Run) in thread
            execution = await this.commandBus.execute(
                new XpertAgentExecutionUpsertCommand({
                    ...(execution ?? {}),
                    xpert: { id: xpert.id } as IXpert,
                    agentKey: xpert.agent.key,
                    inputs: input,
                    status: XpertAgentExecutionStatusEnum.RUNNING,
                    threadId: conversation.threadId
                })
            )
            executionId = execution.id

            let userMessage: IChatMessage = null
            if (retry) {
                // Validate retry prerequisites
                if (!conversationId || !c.options.messageId) {
                    throw new BadRequestException('Retry requires both conversationId and messageId')
                }
                const retryMessage = conversation.messages.find((_) => _.id === c.options.messageId)
                if (!retryMessage) {
                    throw new NotFoundException(`Retry target message not found: ${c.options.messageId}`)
                }
                if (!['ai', 'assistant'].includes(retryMessage.role)) {
                    throw new BadRequestException('Only AI/assistant messages can be retried')
                }
                if (!retryMessage.parentId) {
                    throw new BadRequestException('Retry target message has no parent')
                }

                userMessage = conversation.messages.find((_) => _.id === retryMessage.parentId)
                if (!userMessage) {
                    throw new NotFoundException(`Parent user message not found for retry target: ${retryMessage.id}`)
                }
                if (!['human', 'user'].includes(userMessage.role)) {
                    throw new BadRequestException('Retry target parent must be a user message')
                }

                // Always rebuild retry input from the parent user message.
                // This re-generates the selected assistant answer deterministically.
                const retryInputText = appendMessagePlainText('', userMessage.content)
                input = {
                    ...(input ?? {}),
                    input: retryInputText,
                    ...(userMessage.attachments?.length
                        ? {
                              files: userMessage.attachments as unknown as Partial<IStorageFile>[]
                          }
                        : {})
                }
                state = {
                    ...(state ?? {}),
                    [STATE_VARIABLE_HUMAN]: input
                }

                // Prefer checkpoint from the message BEFORE this user turn.
                // That avoids replaying the selected answer and prevents duplicate human/ai pairs.
                const previousAssistantMessage = userMessage.parentId
                    ? conversation.messages.find((_) => _.id === userMessage.parentId)
                    : null
                if (previousAssistantMessage?.executionId) {
                    const previousExecution = await this.queryBus.execute(
                        new XpertAgentExecutionOneQuery(previousAssistantMessage.executionId)
                    )
                    if (previousExecution?.checkpointId) {
                        checkpointId = previousExecution.checkpointId
                    }
                }

                // Fallback:
                // - for first-turn retry (no previous assistant), rewind to the oldest ancestor checkpoint
                //   to ensure no old assistant answer is replayed;
                // - otherwise use immediate parent checkpoint of retry execution.
                if (!checkpointId && retryMessage.executionId) {
                    const retryExecution = await this.queryBus.execute(
                        new XpertAgentExecutionOneQuery(retryMessage.executionId)
                    )
                    if (retryExecution?.checkpointId) {
                        const checkpoint = await this.checkpointService.findOne({
                            where: {
                                thread_id: conversation.threadId,
                                checkpoint_ns: retryExecution.checkpointNs ?? '',
                                checkpoint_id: retryExecution.checkpointId
                            }
                        })
                        const fallbackCheckpointId = checkpoint?.parent_id ?? retryExecution.checkpointId
                        if (!previousAssistantMessage?.executionId) {
                            checkpointId = await this.resolveOldestCheckpoint(
                                conversation.threadId,
                                retryExecution.checkpointNs ?? '',
                                fallbackCheckpointId
                            )
                        } else {
                            checkpointId = fallbackCheckpointId
                        }
                    }
                }
            } else {
                const _humanMessage: Partial<IChatMessage> = {
                    parent: conversation.messages[conversation.messages.length - 1],
                    role: 'human',
                    content: input.input,
                    conversationId: conversation.id,
                    ...(input.files
                        ? {
                              attachments: input.files as IStorageFile[]
                          }
                        : {})
                }
                userMessage = await this.commandBus.execute(new ChatMessageUpsertCommand(_humanMessage))
            }

            aiMessage = await this.commandBus.execute(
                new ChatMessageUpsertCommand({
                    parent: userMessage,
                    role: 'ai',
                    content: ``,
                    executionId,
                    conversationId: conversation.id,
                    status: 'thinking'
                })
            )
        }

        return new Observable<MessageEvent>((subscriber) => {
            // New conversation
            subscriber.next({
                data: {
                    type: ChatMessageTypeEnum.EVENT,
                    event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
                    data: {
                        id: conversation.id,
                        title: conversation.title || shortTitle(input?.input),
                        status: conversation.status,
                        createdAt: conversation.createdAt,
                        updatedAt: conversation.updatedAt
                    }
                }
            } as MessageEvent)

            subscriber.next({
                data: {
                    type: ChatMessageTypeEnum.EVENT,
                    event: ChatMessageEventTypeEnum.ON_MESSAGE_START,
                    data: { ...aiMessage, status: 'thinking' }
                }
            } as MessageEvent)

            const logger = this.#logger
            RunnableLambda.from(async (input: TChatRequestHuman) => {
                let status = XpertAgentExecutionStatusEnum.SUCCESS
                let error = null
                let result = ''
                let agentObservable: Observable<MessageEvent> = null

                // Memory Reply
                const memoryReply = latestXpert.features?.memoryReply
                if (memoryReply?.enabled && memoryStore) {
                    const items = await memoryStore.search([xpertId, LongTermMemoryTypeEnum.QA], { query: input.input })
                    const memoryReplies = items.filter((item) => item.score >= (memoryReply.scoreThreshold ?? 0.8))
                    if (memoryReplies.length > 0) {
                        // If a memory matched, simulate an AI text message with the answer
                        agentObservable = new Observable<MessageEvent>((subscriber) => {
                            subscriber.next({
                                data: {
                                    type: ChatMessageTypeEnum.MESSAGE,
                                    data: memoryReplies[0].value?.answer
                                }
                            } as MessageEvent)
                            subscriber.complete()
                        })
                    }
                }

                if (!agentObservable) {
                    // No memory reply then create agents graph
                    agentObservable = await this.commandBus.execute<
                        XpertAgentChatCommand,
                        Promise<Observable<MessageEvent>>
                    >(
                        new XpertAgentChatCommand(state, xpert.agent.key, xpert, {
                            ...(options ?? {}),
                            store: memoryStore,
                            conversationId: conversation.id,
                            isDraft: options?.isDraft,
                            execution: { id: executionId, category: 'agent' },
                            command,
                            memories,
                            summarizeTitle: !latestXpert.agentConfig?.summarizeTitle?.disable,
                            checkpointId: checkpointId
                        })
                    )
                }

                let _execution = null
                let operation: TSensitiveOperation = null
                const messageAppendContextTracker = createMessageAppendContextTracker()
                concat(
                    agentObservable.pipe(
                        tap({
                            next: (event) => {
                                if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
                                    const { messageContext } = messageAppendContextTracker.resolve({
                                        incoming: event.data.data,
                                        fallbackSource:
                                            typeof event.data.data === 'string' ? 'memory_reply' : undefined,
                                        fallbackStreamId: aiMessage?.id ?? executionId
                                    })

                                    appendMessageContent(aiMessage, event.data.data, messageContext)
                                    result = appendMessagePlainText(result, event.data.data, messageContext)
                                } else if (event.data.type === ChatMessageTypeEnum.EVENT) {
                                    switch (event.data.event) {
                                        case ChatMessageEventTypeEnum.ON_AGENT_END: {
                                            _execution = event.data.data
                                            break
                                        }
                                        case ChatMessageEventTypeEnum.ON_INTERRUPT: {
                                            operation = event.data.data
                                            break
                                        }
                                        case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE: {
                                            appendMessageSteps(aiMessage, [event.data.data])
                                            break
                                        }
                                        case ChatMessageEventTypeEnum.ON_CHAT_EVENT: {
                                            if (event.data.data?.type === 'sandbox') {
                                                conversation.options ??= {}
                                                conversation.options.features ??= []
                                                conversation.options.features.push('sandbox')
                                                conversation.options.features = uniq(conversation.options.features)
                                            }
                                            break
                                        }
                                    }
                                }
                            }
                        }),
                        catchError((err) => {
                            status = XpertAgentExecutionStatusEnum.ERROR
                            error = getErrorMessage(err)
                            return EMPTY
                        })
                    ),
                    // Then do the final async work after the agent stream
                    of(true).pipe(
                        switchMap(async () => {
                            try {
                                // Record Execution
                                const timeEnd = Date.now()

                                const entity =
                                    _execution?.status === XpertAgentExecutionStatusEnum.ERROR ||
                                    status === XpertAgentExecutionStatusEnum.ERROR
                                        ? {
                                              id: executionId,
                                              elapsedTime: timeEnd - timeStart,
                                              status: XpertAgentExecutionStatusEnum.ERROR,
                                              error: _execution?.error || error,
                                              outputs: {
                                                  output: result
                                              }
                                          }
                                        : {
                                              id: executionId,
                                              elapsedTime: timeEnd - timeStart,
                                              status,
                                              outputs: {
                                                  output: result
                                              }
                                          }
                                await this.commandBus.execute(new XpertAgentExecutionUpsertCommand(entity))

                                // Update ai message
                                if (_execution?.status === XpertAgentExecutionStatusEnum.ERROR) {
                                    aiMessage.status = XpertAgentExecutionStatusEnum.ERROR
                                    aiMessage.error = _execution.error
                                } else if (status) {
                                    aiMessage.status = status
                                    aiMessage.error = error
                                }
                                // Keep message snapshot consistent with final execution output.
                                // This is part of the normal protocol contract (not a fallback path).
                                const hasMessageText =
                                    typeof aiMessage.content === 'string' ? aiMessage.content.trim().length > 0 : false
                                if (!hasMessageText && result) {
                                    aiMessage.content = result
                                }
                                await this.commandBus.execute(new ChatMessageUpsertCommand(aiMessage))

                                subscriber.next({
                                    data: {
                                        type: ChatMessageTypeEnum.EVENT,
                                        event: ChatMessageEventTypeEnum.ON_MESSAGE_END,
                                        data: { ...aiMessage }
                                    }
                                } as MessageEvent)

                                // Update conversation
                                let convStatus: TChatConversationStatus = 'idle'
                                if (_execution?.status === XpertAgentExecutionStatusEnum.ERROR) {
                                    convStatus = 'error'
                                } else if (_execution?.status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
                                    convStatus = 'interrupted'
                                }
                                const _conversation = await this.commandBus.execute(
                                    new ChatConversationUpsertCommand({
                                        id: conversation.id,
                                        status: convStatus,
                                        title: conversation.title || _execution?.title || shortTitle(input?.input),
                                        operation,
                                        error: _execution?.error,
                                        options: conversation.options
                                    })
                                )

                                // Schedule summary job
                                if (memory?.enabled && memory.profile?.enabled && convStatus === 'idle') {
                                    await this.commandBus.execute(
                                        new ScheduleSummaryJobCommand(conversation.id, userId, memory)
                                    )
                                }

                                return {
                                    data: {
                                        type: ChatMessageTypeEnum.EVENT,
                                        event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
                                        data: {
                                            id: _conversation.id,
                                            title: _conversation.title,
                                            status: _conversation.status,
                                            operation: _conversation.operation,
                                            error: _conversation.error
                                        }
                                    }
                                } as MessageEvent
                            } catch (err) {
                                this.#logger.warn(err)
                                subscriber.error(err)
                            }
                        })
                    )
                )
                    .pipe(
                        tap({
                            /**
                             * This function is triggered when the stream is unsubscribed
                             */
                            unsubscribe: async () => {
                                this.#logger.debug(`Canceled by client!`)
                                try {
                                    // Record Execution
                                    const timeEnd = Date.now()

                                    await this.commandBus.execute(
                                        new XpertAgentExecutionUpsertCommand({
                                            id: executionId,
                                            elapsedTime: timeEnd - timeStart,
                                            status: XpertAgentExecutionStatusEnum.ERROR,
                                            error: 'Aborted!',
                                            outputs: {
                                                output: result
                                            }
                                        })
                                    )

                                    await this.commandBus.execute(
                                        new ChatMessageUpsertCommand({
                                            ...aiMessage,
                                            status: XpertAgentExecutionStatusEnum.SUCCESS
                                        })
                                    )

                                    await this.commandBus.execute(
                                        new ChatConversationUpsertCommand({
                                            id: conversation.id,
                                            status: 'idle',
                                            title: conversation.title || _execution?.title || shortTitle(input?.input),
                                            options: conversation.options
                                        })
                                    )
                                } catch (err) {
                                    this.#logger.error(err)
                                }
                            }
                        })
                    )
                    .subscribe(subscriber)
            })
                .invoke(input, {
                    callbacks: [
                        {
                            handleCustomEvent(eventName, data, runId) {
                                if (eventName === ChatMessageEventTypeEnum.ON_CHAT_EVENT) {
                                    logger.debug(`========= handle custom event in xpert:`, eventName, runId)
                                    subscriber.next({
                                        data: {
                                            type: ChatMessageTypeEnum.EVENT,
                                            event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                                            data: data
                                        }
                                    } as MessageEvent)
                                } else {
                                    logger.warn(`Unprocessed custom event in xpert:`, eventName, runId)
                                }
                            }
                        }
                    ]
                })
                .catch((err) => {
                    console.error(err)
                    subscriber.next({
                        data: {
                            type: ChatMessageTypeEnum.EVENT,
                            event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
                            data: {
                                id: conversation.id,
                                status: 'error',
                                error: getErrorMessage(err)
                            }
                        }
                    } as MessageEvent)
                    subscriber.error(err)
                })

            // It will be triggered when the subscription ends normally or is unsubscribed.
            // This function can be used for cleanup work.
            return () => {
                //
            }
        })
    }

    /**
     * Walk to the oldest ancestor checkpoint in the same namespace.
     * Used for first-turn retry to avoid replaying already-generated assistant messages.
     */
    private async resolveOldestCheckpoint(
        threadId: string,
        checkpointNs: string,
        startCheckpointId: string
    ): Promise<string> {
        let checkpointId = startCheckpointId
        const visited = new Set<string>()

        for (let i = 0; i < 30 && checkpointId; i++) {
            if (visited.has(checkpointId)) {
                break
            }
            visited.add(checkpointId)

            const checkpoint = await this.checkpointService.findOne({
                where: {
                    thread_id: threadId,
                    checkpoint_ns: checkpointNs ?? '',
                    checkpoint_id: checkpointId
                }
            })
            const parentId = checkpoint?.parent_id
            if (!parentId || parentId === checkpointId) {
                break
            }
            checkpointId = parentId
        }

        return checkpointId
    }
}

async function getLongTermMemory(store: BaseStore, xpertId: string, input: string) {
    return await store?.search([xpertId, LongTermMemoryTypeEnum.PROFILE], { query: input })
}
