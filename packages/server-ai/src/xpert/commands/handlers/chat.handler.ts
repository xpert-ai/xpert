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
    stringifyMessageContent,
    STATE_VARIABLE_HUMAN,
    TChatConversationStatus,
    TChatRequestHuman,
    TSensitiveOperation,
    TXpertChatResumeRequest,
    TXpertChatRetryRequest,
    XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { catchError, concat, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { uniq } from 'lodash'
import { CancelSummaryJobCommand } from '../../../chat-conversation/commands/cancel-summary.command'
import { ScheduleSummaryJobCommand } from '../../../chat-conversation/commands/schedule-summary.command'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { appendMessageSteps, ChatMessageUpsertCommand } from '../../../chat-message'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands/chat.command'
import { XpertService } from '../../xpert.service'
import { XpertChatCommand } from '../chat.command'
import { CreateMemoryStoreCommand, normalizeChatState } from '../../../shared'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries/get-one.query'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint'

@CommandHandler(XpertChatCommand)
export class XpertChatHandler implements ICommandHandler<XpertChatCommand> {
    readonly #logger = new Logger(XpertChatHandler.name)

    constructor(
        private readonly xpertService: XpertService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    /**
     * Retry needs the checkpoint captured right after the original human input
     * was written into LangGraph state. Replaying from the latest execution
     * checkpoint can be a no-op or resume from a later loop step, so we walk
     * backward through checkpoint ancestry until we find the nearest `input`
     * checkpoint for that run.
     */
    private async resolveRetryInputCheckpointId(
        threadId: string,
        checkpointNs: string | null | undefined,
        checkpointId: string | null | undefined
    ): Promise<string> {
        if (!threadId || !checkpointId) {
            throw new BadRequestException('Retry source checkpoint not found')
        }

        const visited = new Set<string>()
        let currentCheckpointId = checkpointId

        while (currentCheckpointId) {
            if (visited.has(currentCheckpointId)) {
                throw new BadRequestException('Retry source checkpoint ancestry contains a cycle')
            }
            visited.add(currentCheckpointId)

            const tuple = await this.queryBus.execute(
                new CopilotCheckpointGetTupleQuery({
                    thread_id: threadId,
                    checkpoint_ns: checkpointNs ?? '',
                    checkpoint_id: currentCheckpointId
                })
            )
            if (!tuple) {
                break
            }

            const resolvedCheckpointId = tuple.config?.configurable?.checkpoint_id ?? currentCheckpointId
            if (tuple.metadata?.source === 'input') {
                return resolvedCheckpointId
            }

            currentCheckpointId = tuple.parentConfig?.configurable?.checkpoint_id ?? null
        }

        throw new BadRequestException('Retry source input checkpoint not found')
    }

    public async execute(c: XpertChatCommand): Promise<Observable<MessageEvent>> {
        const request = c.request
        const { options } = c
        const { xpertId, taskId, from, fromEndUserId } = options ?? {}
        let { execution } = options ?? {}
        const userId = RequestContext.currentUserId()
        let input: TChatRequestHuman | null =
            request.action === 'send'
                ? normalizeChatState(request.state, request.message.input)[STATE_VARIABLE_HUMAN]
                : request.action === 'resume'
                  ? normalizeChatState(request.state)[STATE_VARIABLE_HUMAN]
                  : null
        let state =
            request.action === 'retry'
                ? null
                : request.action === 'send'
                  ? normalizeChatState(request.state, request.message.input)
                  : normalizeChatState(request.state)

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
        // Resume continues an interrupted AI turn in place by reusing the existing
        // conversation, target AI message, and execution instead of creating a new run.
        if (request.action === 'resume') {
            conversation = await this.queryBus.execute(
                new GetChatConversationQuery({ id: request.conversationId }, ['messages'])
            )
            conversation.status = 'busy'
            const targetMessage = resolveResumeTargetMessage(request, conversation.messages)
            if (!targetMessage) {
                throw new BadRequestException('Missing resume target AI message')
            }
            aiMessage = targetMessage
            if (!aiMessage) {
                throw new BadRequestException(`Resume target AI message not found`)
            }
            executionId = request.target.executionId ?? aiMessage.executionId
            if (!executionId) {
                throw new BadRequestException('Missing resume target execution')
            }
            state ??= normalizeChatState()

            // Cancel summary job
            if (memory?.enabled && memory.profile?.enabled) {
                await this.commandBus.execute(new CancelSummaryJobCommand(conversation.id))
            }
        } else {
            // New message in conversation
            if (request.conversationId) {
                conversation = await this.commandBus.execute(
                    new ChatConversationUpsertCommand(
                        {
                            id: request.conversationId,
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
                if (request.action === 'retry') {
                    throw new BadRequestException('Retry requires conversationId')
                }
                // New conversation
                conversation = await this.commandBus.execute(
                    new ChatConversationUpsertCommand(
                        {
                            status: 'busy',
                            projectId: request.projectId,
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

            let userMessage: IChatMessage = null
            // Retry starts a fresh AI turn from the original human input by locating
            // the run's nearest `input` checkpoint, while still creating a new
            // execution and AI placeholder for the retried response.
            if (request.action === 'retry') {
                const retryMessage = resolveRetryMessage(request, conversation.messages)
                if (!retryMessage) {
                    throw new BadRequestException('Missing retry source AI message')
                }
                const sourceExecutionId = request.source.executionId ?? retryMessage.executionId
                if (!sourceExecutionId) {
                    throw new BadRequestException('Retry source execution not found')
                }
                const sourceExecution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(sourceExecutionId))
                if (!sourceExecution) {
                    throw new BadRequestException(`Retry source execution "${sourceExecutionId}" not found`)
                }
                checkpointId = await this.resolveRetryInputCheckpointId(
                    sourceExecution.threadId ?? conversation.threadId,
                    sourceExecution.checkpointNs,
                    sourceExecution.checkpointId
                )
                userMessage = conversation.messages.find((message) => message.id === retryMessage.parentId)
                if (!userMessage) {
                    throw new BadRequestException('Retry source human message not found')
                }
                const fallbackRetryState = {
                    ...(conversation.options?.parameters ?? {}),
                    input: stringifyMessageContent(userMessage.content),
                    ...(userMessage.attachments?.length
                        ? {
                              files: userMessage.attachments
                          }
                        : {})
                }
                input = resolveRetryHumanInput(sourceExecution.inputs, fallbackRetryState)
                state = normalizeChatState(undefined, input)
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

            if (request.action !== 'retry') {
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
        state ??= normalizeChatState(undefined, input)

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
                            resume:
                                request.action === 'resume'
                                    ? {
                                          decision: request.decision,
                                          ...(request.patch ? { patch: request.patch } : {})
                                      }
                                    : undefined,
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
}

async function getLongTermMemory(store: BaseStore, xpertId: string, input: string) {
    return await store?.search([xpertId, LongTermMemoryTypeEnum.PROFILE], { query: input })
}

function resolveRetryHumanInput(sourceInputs: unknown, fallbackInput: TChatRequestHuman): TChatRequestHuman {
    const retryInput = extractRetryHumanInput(sourceInputs)

    if (typeof retryInput === 'string') {
        return {
            ...fallbackInput,
            input: retryInput.trim().length ? retryInput : fallbackInput.input
        }
    }

    if (!isChatRequestHumanRecord(retryInput)) {
        return fallbackInput
    }

    const mergedInput: TChatRequestHuman = {
        ...fallbackInput,
        ...retryInput
    }

    if (typeof mergedInput.input !== 'string' || !mergedInput.input.trim().length) {
        mergedInput.input = fallbackInput.input
    }

    if ((!Array.isArray(mergedInput.files) || !mergedInput.files.length) && Array.isArray(fallbackInput.files)) {
        mergedInput.files = fallbackInput.files
    }

    return mergedInput
}

function extractRetryHumanInput(sourceInputs: unknown): unknown {
    if (isChatRequestHumanRecord(sourceInputs) && isChatRequestHumanRecord(sourceInputs[STATE_VARIABLE_HUMAN])) {
        return sourceInputs[STATE_VARIABLE_HUMAN]
    }

    return sourceInputs
}

function isChatRequestHumanRecord(value: unknown): value is TChatRequestHuman {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function resolveRetryMessage(request: TXpertChatRetryRequest, messages?: IChatMessage[] | null) {
    if (request.source.aiMessageId) {
        return messages.find((message) => message.id === request.source.aiMessageId) ?? null
    }
    return findLastAiMessage(messages) ?? null
}

function resolveResumeTargetMessage(request: TXpertChatResumeRequest, messages?: IChatMessage[] | null) {
    if (request.target.aiMessageId) {
        return messages.find((message) => message.id === request.target.aiMessageId) ?? null
    }
    return findLastAiMessage(messages) ?? null
}

function findLastAiMessage(messages?: IChatMessage[] | null) {
    if (!messages?.length) {
        return null
    }

    const message = [...messages].reverse().find((item) => item?.role === 'ai')
    return message ?? null
}
