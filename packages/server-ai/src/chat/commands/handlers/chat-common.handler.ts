import { isToolMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { Command, CompiledStateGraph, NodeInterrupt } from '@langchain/langgraph'
import { ForbiddenException, Inject, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import {
    appendMessageContent,
    appendMessagePlainText,
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    CopilotChatMessage,
    createFollowUpConsumedEvent,
    createMessageAppendContextTracker,
    IChatConversation,
    IChatMessage,
    IStorageFile,
    IXpertAgentExecution,
    STATE_VARIABLE_HUMAN,
    STATE_VARIABLE_SYS,
    stringifyMessageContent,
    TChatConversationStatus,
    TChatRequest,
    TChatRequestHuman,
    TInterruptCommand,
    TSensitiveOperation,
    TXpertAgentConfig,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { getErrorMessage, pick } from '@xpert-ai/server-common'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime'
import { isUUID } from 'class-validator'
import { format } from 'date-fns/format'
import { t } from 'i18next'
import { isNil } from 'lodash'
import { EMPTY, map, Observable, tap } from 'rxjs'
import { ChatConversationUpsertCommand, GetChatConversationQuery } from '../../../chat-conversation'
import {
    appendMessageSteps,
    ChatMessageUpsertCommand,
    sanitizeMessageContentForPersistence
} from '../../../chat-message'
import { bindFileActivityEvent } from '../../../chat-message/file-activity-event'
import { bindResourceCardEvent } from '../../../chat-message/resource-card-event'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { GetOwnedStorageFileQuery } from '../../../file-understanding/queries/get-owned-storage-file.query'
import {
    collectPendingFollowUpsByClientMessageId,
    CONFIG_KEY_CREDENTIALS,
    ConversationTitleService,
    createHumanMessage,
    hydrateHumanInput,
    hydrateSendRequestHumanInput,
    normalizeReferences,
    rejectGraph,
    updateToolCalls,
    VOLUME_CLIENT,
    VolumeClient
} from '../../../shared'
import { visibleFollowUpReferences } from '../../../shared/agent/persisted-follow-up'
import { CompleteToolCallsQuery, createMapStreamEvents } from '../../../xpert-agent'
import {
    assertExecutionBelongsToThread,
    XpertAgentExecutionOneQuery,
    XpertAgentExecutionUpsertCommand
} from '../../../xpert-agent-execution'
import { XpertProjectService } from '../../../xpert-project/'
import {
    attachChatFileAssetsToConversation,
    getChatMessageFiles,
    normalizeChatHumanInputFiles,
    toChatFileAssetReferences,
    toLegacyChatStorageFileAttachments
} from '../../../xpert/commands/handlers/chat-file-assets'
import { ChatCommonCommand } from '../chat-common.command'
import { ChatCommonAgentBuilder } from './chat-common-agent-builder'
import {
    resolveConversationResumeTargetMessageId,
    resolveConversationRetrySourceMessageId,
    resolveRetryHumanInput,
    shouldRejectResumeWithGraph,
    toInterruptCommand
} from './chat-common-input'

const GeneralAgentRecursionLimit = 99

@CommandHandler(ChatCommonCommand)
export class ChatCommonHandler implements ICommandHandler<ChatCommonCommand> {
    readonly #logger = new Logger(ChatCommonHandler.name)

    constructor(
        private readonly checkpointSaver: CopilotCheckpointSaver,
        private readonly projectService: XpertProjectService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly conversationTitleService: ConversationTitleService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient,
        private readonly middlewareRegistry: AgentMiddlewareRegistry,
        private readonly middlewareRuntime: AgentMiddlewareRuntimeService
    ) {}

    public async execute(command: ChatCommonCommand): Promise<Observable<any>> {
        const request = command.request
        const hydratedRequest = hydrateSendRequestHumanInput<TChatRequest>(request)
        const { tenantId, organizationId, user, from: chatFrom } = command.options
        const userId = RequestContext.currentUserId()
        const languageCode = command.options.language || user.preferredLanguage || 'en-US'
        let rawSendInput = request.action === 'send' ? request.message.input : null
        let input: TChatRequestHuman | null = hydratedRequest.action === 'send' ? hydratedRequest.message.input : null
        let projectId = request.action === 'send' ? request.projectId : undefined
        let checkpointId: string | undefined
        const interruptCommand = request.action === 'resume' ? toInterruptCommand(request) : null
        const retry = request.action === 'retry'
        const confirm = request.action === 'resume'

        if (request.action === 'follow_up') {
            const conversation = await this.queryBus.execute(
                new GetChatConversationQuery({ id: request.conversationId }, [
                    'messages',
                    'messages.attachments',
                    'messages.fileAssets'
                ])
            )
            if (!conversation) {
                throw new Error(`Conversation "${request.conversationId}" not found`)
            }

            let followUpInput = request.message.input
            const normalizedFollowUp = await normalizeChatHumanInputFiles(followUpInput, {
                commandBus: this.commandBus,
                queryBus: this.queryBus,
                context: {
                    conversationId: conversation.id,
                    threadId: conversation.threadId,
                    projectId: conversation.projectId
                }
            })
            if (normalizedFollowUp.changed && normalizedFollowUp.input) {
                followUpInput = normalizedFollowUp.input
            }
            const hydratedFollowUpInput = hydrateHumanInput(followUpInput)
            const followUpFiles = Array.isArray(followUpInput?.files) ? followUpInput.files : []
            const followUpFileAssets = toChatFileAssetReferences(followUpFiles)
            const followUpAttachments = toLegacyChatStorageFileAttachments(followUpFiles)
            const targetExecutionId =
                request.target?.executionId ??
                [...(conversation.messages ?? [])].reverse().find((message) => message.role === 'ai')?.executionId ??
                null

            const references = normalizeReferences(followUpInput?.references)
            if (
                !hydratedFollowUpInput?.input?.trim() &&
                references.length === 0 &&
                (!Array.isArray(followUpInput?.files) || followUpInput.files.length === 0)
            ) {
                throw new Error('Follow-up input is required')
            }
            await this.commandBus.execute(
                new ChatMessageUpsertCommand({
                    parent: conversation.messages?.[conversation.messages.length - 1] ?? null,
                    role: 'human',
                    content: followUpInput?.input,
                    conversationId: conversation.id,
                    ...(references.length
                        ? {
                              references
                          }
                        : {}),
                    ...(followUpAttachments.length
                        ? {
                              attachments: followUpAttachments
                          }
                        : {}),
                    ...(followUpFileAssets.length ? { fileAssets: followUpFileAssets } : {}),
                    executionId: targetExecutionId ?? undefined,
                    followUpMode: request.mode,
                    followUpStatus: 'pending',
                    targetExecutionId,
                    visibleAt: null,
                    thirdPartyMessage: {
                        followUpInput,
                        followUpClientMessageId: request.message.clientMessageId ?? null
                    }
                })
            )
            await attachChatFileAssetsToConversation(this.commandBus, conversation, followUpFiles, {
                projectId: conversation.projectId
            })

            return EMPTY
        }

        let conversation: IChatConversation = null
        let userMessage: IChatMessage = null
        let aiMessage: IChatMessage = null
        let executionId: string = command.options.execution?.id
        let executionInputs: unknown = input
        let queueFollowUpConsumedEvent: ReturnType<typeof createFollowUpConsumedEvent> | null = null
        // Continue thread when confirm or reject operation
        if (confirm) {
            if (isNil(request.conversationId)) {
                throw new Error('Conversation ID is required for confirm or reject operation')
            }
            conversation = await this.queryBus.execute(
                new GetChatConversationQuery({ id: request.conversationId }, [
                    'messages',
                    'messages.attachments',
                    'messages.fileAssets'
                ])
            )
            if (!conversation) {
                throw new Error(`Conversation "${request.conversationId}" not found`)
            }
            projectId ??= conversation.projectId
            conversation.status = 'busy'
            const targetMessageId = resolveConversationResumeTargetMessageId(request, conversation.messages)
            if (!targetMessageId) {
                throw new Error('Conversation resume target AI message not found')
            }
            aiMessage = conversation.messages.find((message) => message.id === targetMessageId) as CopilotChatMessage
            if (!aiMessage) {
                throw new Error(`Conversation resume target AI message "${targetMessageId}" not found`)
            }
            executionId = request.target.executionId ?? aiMessage.executionId
            if (!executionId) {
                throw new Error('Execution ID is required for resume operation')
            }
            const execution = assertExecutionBelongsToThread(
                await this.queryBus.execute<IXpertAgentExecution | null>(new XpertAgentExecutionOneQuery(executionId)),
                conversation.threadId
            )
            executionInputs = execution.inputs
        } else {
            if (isNil(request.conversationId)) {
                if (retry) {
                    throw new Error('Conversation ID is required for retry operation')
                }
                const volume = await this.volumeClient
                    .resolve({
                        tenantId,
                        catalog: projectId ? 'projects' : 'users',
                        projectId,
                        userId
                    })
                    .ensureRoot()
                const workspacePath = volume.serverRoot
                const workspaceUrl = volume.exposesDirectFileUrls() ? volume.publicBaseUrl : undefined
                conversation = await this.commandBus.execute(
                    new ChatConversationUpsertCommand({
                        tenantId,
                        organizationId,
                        projectId: projectId,
                        createdById: user.id,
                        status: 'busy',
                        options: {
                            parameters: input,
                            workspacePath,
                            workspaceUrl
                        },
                        from: chatFrom
                    })
                )
            } else {
                conversation = await this.commandBus.execute(
                    new ChatConversationUpsertCommand(
                        {
                            id: request.conversationId,
                            status: 'busy',
                            error: null
                        },
                        ['messages', 'messages.attachments', 'messages.fileAssets']
                    )
                )
                projectId ??= conversation.projectId
            }

            if (request.action === 'send' && input) {
                const normalizedInput = await normalizeChatHumanInputFiles(input, {
                    commandBus: this.commandBus,
                    queryBus: this.queryBus,
                    context: {
                        conversationId: conversation.id,
                        threadId: conversation.threadId,
                        projectId: conversation.projectId ?? projectId
                    }
                })
                if (normalizedInput.changed && normalizedInput.input) {
                    input = normalizedInput.input
                    rawSendInput = {
                        ...(rawSendInput ?? {}),
                        files: input.files
                    } as TChatRequestHuman
                    executionInputs = input
                }
            }

            const persistedPendingFollowUpGroup =
                request.action === 'send'
                    ? collectPendingFollowUpsByClientMessageId(conversation.messages, request.message.clientMessageId)
                    : null

            if (retry) {
                const retryMessageId = resolveConversationRetrySourceMessageId(request, conversation.messages)
                if (!retryMessageId) {
                    throw new Error('Retry source AI message not found')
                }
                const retryMessage = conversation.messages.find((message) => message.id === retryMessageId)
                if (!retryMessage) {
                    throw new Error(`Retry source AI message "${retryMessageId}" not found`)
                }
                const sourceExecutionId = request.source.executionId ?? retryMessage.executionId
                if (!sourceExecutionId) {
                    throw new Error('Retry source execution not found')
                }
                const sourceExecution = assertExecutionBelongsToThread(
                    await this.queryBus.execute<IXpertAgentExecution | null>(
                        new XpertAgentExecutionOneQuery(sourceExecutionId)
                    ),
                    conversation.threadId
                )
                executionInputs = sourceExecution.inputs
                if (sourceExecution.checkpointId) {
                    const { checkpoint } = await this.checkpointSaver.getCopilotCheckpoint({
                        configurable: {
                            thread_id: conversation.threadId,
                            checkpoint_ns: sourceExecution.checkpointNs ?? '',
                            checkpoint_id: sourceExecution.checkpointId
                        }
                    })
                    checkpointId = checkpoint?.parent_id ?? sourceExecution.checkpointId
                }
                userMessage = conversation.messages.find((message) => message.id === retryMessage.parentId)
                if (!userMessage) {
                    throw new Error('Retry source human message not found')
                }
                const fallbackRetryInput = {
                    ...(conversation.options?.parameters ?? {}),
                    input: stringifyMessageContent(userMessage.content),
                    ...(userMessage.references?.length
                        ? {
                              references: userMessage.references
                          }
                        : {}),
                    ...(getChatMessageFiles(userMessage).length
                        ? {
                              files: getChatMessageFiles(userMessage)
                          }
                        : {})
                } as TChatRequestHuman
                input = resolveRetryHumanInput(sourceExecution.inputs, fallbackRetryInput)
                executionInputs = input
            }

            if (!userMessage) {
                if (persistedPendingFollowUpGroup?.matched?.id) {
                    input = hydrateHumanInput(persistedPendingFollowUpGroup.mergedHumanInput)
                    executionInputs = input

                    const visibleAt = new Date()
                    const consumedMessages: IChatMessage[] = []

                    for (const pendingFollowUp of persistedPendingFollowUpGroup.items) {
                        consumedMessages.push(
                            await this.commandBus.execute(
                                new ChatMessageUpsertCommand({
                                    ...pendingFollowUp,
                                    followUpStatus: 'consumed',
                                    visibleAt
                                })
                            )
                        )
                    }

                    userMessage =
                        consumedMessages[consumedMessages.length - 1] ??
                        conversation.messages.find((message) => message.id === persistedPendingFollowUpGroup.matched.id)

                    const visibleFollowUps = visibleFollowUpReferences(consumedMessages)
                    queueFollowUpConsumedEvent = visibleFollowUps.messageIds.length
                        ? createFollowUpConsumedEvent({
                              mode: 'queue',
                              ...visibleFollowUps,
                              executionId: persistedPendingFollowUpGroup.targetExecutionId,
                              visibleAt: visibleAt.toISOString()
                          })
                        : null
                } else {
                    const persistedInput = rawSendInput ?? input
                    const references = normalizeReferences(persistedInput?.references)
                    const persistedFiles = Array.isArray(persistedInput?.files) ? persistedInput.files : []
                    const fileAssets = toChatFileAssetReferences(persistedFiles)
                    const legacyAttachments = toLegacyChatStorageFileAttachments(persistedFiles)
                    userMessage = await this.commandBus.execute(
                        new ChatMessageUpsertCommand({
                            role: 'human',
                            messageEnvelope: command.options.messageEnvelope,
                            createdInThreadId: conversation.threadId,
                            content: persistedInput?.input,
                            conversationId: conversation.id,
                            ...(references.length
                                ? {
                                      references
                                  }
                                : {}),
                            ...(legacyAttachments.length ? { attachments: legacyAttachments } : {}),
                            ...(fileAssets.length ? { fileAssets } : {})
                        })
                    )
                    await attachChatFileAssetsToConversation(this.commandBus, conversation, persistedFiles, {
                        projectId: conversation.projectId ?? projectId
                    })
                }
            }
        }

        // New execution (Run) in thread
        const execution = await this.commandBus.execute<XpertAgentExecutionUpsertCommand, IXpertAgentExecution>(
            new XpertAgentExecutionUpsertCommand({
                id: executionId,
                inputs: executionInputs,
                type: projectId ? 'project_agent' : 'chat',
                agentKey: 'general_agent',
                status: XpertAgentExecutionStatusEnum.RUNNING,
                threadId: conversation.threadId
            })
        )
        executionId = execution.id

        // Project & Xperts
        const project = await this.getProject(projectId)

        const abortController = new AbortController()
        const timeStart = Date.now()
        let status = XpertAgentExecutionStatusEnum.SUCCESS
        // Collect the output text into execution
        let result = ''
        let error = null
        // let _execution = null
        let operation: TSensitiveOperation = null
        const messageAppendContextTracker = createMessageAppendContextTracker()
        return new Observable<MessageEvent>((subscriber) => {
            // Send conversation start event
            subscriber.next({
                data: {
                    type: ChatMessageTypeEnum.EVENT,
                    event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
                    data: {
                        id: conversation.id,
                        status: 'busy',
                        createdAt: conversation.createdAt,
                        updatedAt: conversation.updatedAt
                    }
                }
            } as MessageEvent)

            if (queueFollowUpConsumedEvent) {
                subscriber.next({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                        data: queueFollowUpConsumedEvent
                    }
                } as MessageEvent)
            }

            const reflect = RunnableLambda.from(async (input: TChatRequestHuman) => {
                if (!aiMessage) {
                    aiMessage = await this.commandBus.execute(
                        new ChatMessageUpsertCommand({
                            role: 'ai',
                            content: ``,
                            executionId,
                            conversationId: conversation.id,
                            status: 'thinking'
                        })
                    )
                }

                subscriber.next({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_MESSAGE_START,
                        data: { ...aiMessage, status: 'thinking' }
                    }
                } as MessageEvent)

                let graph: CompiledStateGraph<any, any, any> = null
                try {
                    // // Vcs credentials
                    // const vcsCredentials = projectId
                    //     ? await this.commandBus.execute(new GetVcsCredentialsCommand(projectId))
                    //     : null
                    const thread_id = execution.threadId
                    const mute = [] as TXpertAgentConfig['mute']
                    graph = await this.createReactAgent(
                        command,
                        project,
                        execution,
                        abortController,
                        subscriber,
                        conversation.id,
                        mute
                    )
                    // Run
                    const config = {
                        thread_id,
                        checkpoint_ns: '',
                        // Use checkpoint id to resume thread state when retrying
                        ...(checkpointId ? { checkpoint_id: checkpointId } : {})
                    }
                    let graphInput = null
                    if (request.action === 'resume') {
                        const commandPayload = interruptCommand ?? ({} as TInterruptCommand)
                        if (commandPayload.toolCalls?.length) {
                            await updateToolCalls(graph, config, commandPayload)
                        }
                        if (shouldRejectResumeWithGraph(request)) {
                            if (!commandPayload.agentKey) {
                                throw new Error('Agent key is required for reject operation')
                            }
                            await rejectGraph(graph, config, commandPayload)
                        } else {
                            graphInput = new Command(pick(commandPayload, 'resume', 'update'))
                        }
                    } else if (input?.input || retry) {
                        if (checkpointId) {
                            // Replay from the saved checkpoint state instead of appending a new human input.
                            graphInput = null
                        } else {
                            graphInput = {
                                ...(input ?? {}),
                                messages: [
                                    await createHumanMessage(
                                        this.commandBus,
                                        this.queryBus,
                                        { [STATE_VARIABLE_HUMAN]: input },
                                        { enabled: true, resolution: 'low' }
                                    )
                                ],
                                [STATE_VARIABLE_SYS]: {
                                    language: languageCode,
                                    user_email: user.email,
                                    timezone: user.timeZone || command.options.timeZone,
                                    date: format(new Date(), 'yyyy-MM-dd'),
                                    datetime: new Date().toLocaleString(),
                                    thread_id: conversation.threadId,
                                    workspace_path: conversation.options?.workspacePath,
                                    workspace_url: conversation.projectId
                                        ? undefined
                                        : conversation.options?.workspaceUrl
                                }
                            }
                        }
                    }

                    const recordLastState = async () => {
                        // Don't pass checkpoint_id here - we want the LATEST state, not the state
                        // from when graph execution started (which would be the retry checkpoint).
                        const state = await graph.getState({
                            configurable: {
                                thread_id: config.thread_id,
                                checkpoint_ns: config.checkpoint_ns ?? ''
                                // Intentionally omit checkpoint_id to get latest state
                            }
                        })

                        const { checkpoint, pendingWrites } = await this.checkpointSaver.getCopilotCheckpoint(
                            state.config ?? state.parentConfig
                        )

                        // Use checkpoint from saver as primary source (most up-to-date),
                        // fallback to state.config for backwards compatibility.
                        // pendingWrites takes highest priority if present.
                        if (pendingWrites?.length) {
                            execution.checkpointNs = pendingWrites[0].checkpoint_ns
                            execution.checkpointId = pendingWrites[0].checkpoint_id
                        } else if (checkpoint?.checkpoint_id) {
                            execution.checkpointNs = checkpoint.checkpoint_ns
                            execution.checkpointId = checkpoint.checkpoint_id
                        } else {
                            execution.checkpointNs = state.config?.configurable?.checkpoint_ns
                            execution.checkpointId = state.config?.configurable?.checkpoint_id
                        }
                        // Update execution title from graph states
                        if (state.values.title) {
                            execution.title = state.values.title
                        }

                        return state
                    }

                    const complete = async () => {
                        try {
                            const state = await recordLastState()

                            const timeEnd = Date.now()

                            // Record End time
                            await this.commandBus.execute(
                                new XpertAgentExecutionUpsertCommand({
                                    ...execution,
                                    elapsedTime: Number(execution.elapsedTime ?? 0) + (timeEnd - timeStart),
                                    status,
                                    error,
                                    outputs: {
                                        output: result
                                    }
                                })
                            )

                            let convStatus: TChatConversationStatus = 'idle'
                            if (status === XpertAgentExecutionStatusEnum.ERROR) {
                                convStatus = 'error'
                            } else if (status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
                                convStatus = 'interrupted'
                            }

                            // Interrupted event
                            if (state.tasks?.length) {
                                convStatus = 'interrupted'
                                operation = await this.queryBus.execute<CompleteToolCallsQuery, TSensitiveOperation>(
                                    new CompleteToolCallsQuery(null, state.tasks, state.values)
                                )
                            }

                            const _conversation = await this.commandBus.execute(
                                new ChatConversationUpsertCommand({
                                    id: conversation.id,
                                    status: convStatus,
                                    title: conversation.title || execution.title,
                                    error,
                                    operation
                                })
                            )

                            subscriber.next({
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
                            } as MessageEvent)
                            subscriber.complete()
                        } catch (err) {
                            this.#logger.warn(err)
                            subscriber.error(err)
                        }
                    }

                    try {
                        const stream = graph.streamEvents(graphInput, {
                            version: 'v2',
                            configurable: {
                                ...config,
                                tenantId: tenantId,
                                organizationId: organizationId,
                                userId,
                                projectId: project?.id,
                                subscriber,
                                [CONFIG_KEY_CREDENTIALS]: {
                                    // ...vcsCredentials
                                }
                            },
                            recursionLimit: GeneralAgentRecursionLimit,
                            signal: abortController.signal
                        })
                        const transformGraphEvent = createMapStreamEvents(this.#logger, subscriber, {
                            xperts: project?.xperts,
                            // mute: [
                            // 	...mute,
                            // 	[GRAPH_NODE_TITLE_CONVERSATION]
                            // ],
                            unmutes: [],
                            language: languageCode
                        })
                        for await (const event of stream) {
                            const messageContent = transformGraphEvent(event)
                            if (!isNil(messageContent)) {
                                subscriber.next({
                                    data: {
                                        type: ChatMessageTypeEnum.MESSAGE,
                                        data: messageContent
                                    }
                                } as MessageEvent)
                            }
                        }

                        const state = await graph.getState({
                            configurable: {
                                ...config
                            }
                        })

                        execution.checkpointId = state.parentConfig?.configurable?.checkpoint_id

                        // Update execution title from graph states
                        if (state.values.title) {
                            execution.title = state.values.title
                        }

                        const messages = state.values.messages
                        const lastMessage = messages[messages.length - 1]

                        if (isToolMessage(lastMessage)) {
                            subscriber.next({
                                data: {
                                    type: ChatMessageTypeEnum.MESSAGE,
                                    data: lastMessage.content
                                }
                            } as MessageEvent)
                        }
                    } catch (err) {
                        if (err instanceof NodeInterrupt) {
                            status = XpertAgentExecutionStatusEnum.INTERRUPTED
                            error = null
                        } else {
                            status = XpertAgentExecutionStatusEnum.ERROR
                            error = getErrorMessage(err)
                        }
                    } finally {
                        complete().catch((err) => this.#logger.error(err))
                    }
                } catch (err) {
                    console.error(err)
                    this.#logger.error(err)
                    const entity = {
                        id: conversation.id,
                        status: 'error',
                        error: getErrorMessage(err)
                    } as Partial<IChatConversation>
                    await this.commandBus.execute(new ChatConversationUpsertCommand(entity))
                    subscriber.next({
                        data: {
                            type: ChatMessageTypeEnum.EVENT,
                            event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
                            data: entity
                        }
                    } as MessageEvent)
                    subscriber.complete()
                }
            })

            const logger = this.#logger
            reflect
                .invoke(input, {
                    callbacks: [
                        {
                            handleCustomEvent(eventName, data, runId) {
                                if (eventName === ChatMessageEventTypeEnum.ON_CHAT_EVENT) {
                                    logger.debug(`========= handle custom event in project:`, eventName, runId)
                                    subscriber.next({
                                        data: {
                                            type: ChatMessageTypeEnum.EVENT,
                                            event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                                            data: data
                                        }
                                    } as MessageEvent)
                                } else {
                                    logger.warn(`Unprocessed custom event in project:`, eventName, runId)
                                }
                            }
                        }
                    ]
                })
                .catch((err) => {
                    console.error(err)
                })
        }).pipe(
            map((event) => {
                const receipt =
                    bindResourceCardEvent(event.data, { messageId: aiMessage.id, executionId }) ??
                    bindFileActivityEvent(event.data, { messageId: aiMessage.id, executionId })
                return receipt ? { ...event, data: receipt } : event
            }),
            tap({
                next: (event) => {
                    if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
                        const { messageContext } = messageAppendContextTracker.resolve({
                            incoming: event.data.data,
                            fallbackSource: typeof event.data.data === 'string' ? 'chat_reply' : undefined,
                            fallbackStreamId: aiMessage?.id ?? executionId
                        })

                        appendMessageContent(
                            aiMessage as CopilotChatMessage,
                            sanitizeMessageContentForPersistence(event.data.data),
                            messageContext
                        )
                        result = appendMessagePlainText(result, event.data.data, messageContext)
                    } else if (event.data.type === ChatMessageTypeEnum.EVENT) {
                        switch (event.data.event) {
                            // case (ChatMessageEventTypeEnum.ON_AGENT_END): {
                            // 	_execution = event.data.data
                            // 	break
                            // }
                            case ChatMessageEventTypeEnum.ON_INTERRUPT: {
                                operation = event.data.data
                                break
                            }
                            case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE: {
                                appendMessageSteps(aiMessage, [event.data.data])
                                break
                            }
                        }
                    }
                },
                finalize: async () => {
                    try {
                        if (aiMessage) {
                            // Update ai message
                            aiMessage.status = status
                            await this.commandBus.execute(new ChatMessageUpsertCommand(aiMessage))
                        }
                    } catch (err) {
                        this.#logger.error(err)
                    } finally {
                        abortController.abort()
                    }
                }
            })
        )
    }

    async createReactAgent(...args: Parameters<ChatCommonAgentBuilder['createReactAgent']>) {
        return new ChatCommonAgentBuilder(
            this.checkpointSaver,
            this.projectService,
            this.commandBus,
            this.queryBus,
            this.conversationTitleService,
            this.middlewareRegistry,
            this.middlewareRuntime
        ).createReactAgent(...args)
    }

    async getProject(projectId: string) {
        if (projectId) {
            return await this.projectService.findOne(projectId, {
                relations: [
                    'copilotModel',
                    'copilotModel.copilot',
                    'xperts',
                    'xperts.agent',
                    'toolsets',
                    'knowledges',
                    'workspace',
                    'workspace.environments',
                    'vcs'
                ]
            })
        }
        return null
    }

    private async resolveLegacyStorageFileAttachments(
        files: IStorageFile[] | undefined
    ): Promise<IStorageFile[] | undefined> {
        if (!files) {
            return undefined
        }

        return Promise.all(
            files.map(async (file) => {
                const explicitStorageFileId =
                    'storageFileId' in file && typeof file.storageFileId === 'string'
                        ? file.storageFileId.trim()
                        : undefined
                const submittedId = typeof file.id === 'string' ? file.id.trim() : undefined
                const fileAssetId =
                    'fileAssetId' in file && typeof file.fileAssetId === 'string' ? file.fileAssetId.trim() : undefined
                const fileId = 'fileId' in file && typeof file.fileId === 'string' ? file.fileId.trim() : undefined
                const submittedIdIsFileAsset =
                    Boolean(submittedId) && (submittedId === fileAssetId || submittedId === fileId)
                const explicitStorageFileUuid =
                    explicitStorageFileId && isUUID(explicitStorageFileId) ? explicitStorageFileId : undefined
                const submittedUuid = submittedId && isUUID(submittedId) ? submittedId : undefined

                if (
                    explicitStorageFileUuid &&
                    submittedUuid &&
                    explicitStorageFileUuid !== submittedUuid &&
                    !submittedIdIsFileAsset
                ) {
                    throw new ForbiddenException(
                        t('server-ai:Error.FileAssetAccessDenied', {
                            defaultValue: 'You do not have access to this file'
                        })
                    )
                }

                // `storageFileId` is authoritative for AgentFile inputs, whose
                // `id`/`fileId` belongs to FileAsset. Otherwise the relation is
                // driven by `id`, so a non-UUID alias must not mask a UUID id.
                const storageFileId = explicitStorageFileUuid ?? submittedUuid
                if (!storageFileId) {
                    return file
                }

                return this.queryBus.execute<GetOwnedStorageFileQuery, IStorageFile>(
                    new GetOwnedStorageFileQuery(storageFileId)
                )
            })
        )
    }
}
