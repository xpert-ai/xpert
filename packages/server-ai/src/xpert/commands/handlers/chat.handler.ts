import { RunnableLambda } from '@langchain/core/runnables'
import { BaseStore } from '@langchain/langgraph'
import {
    AssistantBindingScope,
    AssistantCode,
    appendMessageContent,
    appendMessagePlainText,
    CHAT_EVENT_TYPE_FOLLOW_UP_CONSUMED,
    ChatMessageEventTypeEnum,
    TChatMessageStep,
    ChatMessageTypeEnum,
    CopilotChatMessage,
    createMessageAppendContextTracker,
    createFollowUpConsumedEvent,
    figureOutXpert,
    IAssistantBindingToolPreferences,
    IChatConversation,
    IChatMessage,
    IStorageFile,
    IXpert,
    LongTermMemoryTypeEnum,
    shortTitle,
    stringifyMessageContent,
    STATE_VARIABLE_HUMAN,
    STATE_VARIABLE_SYS,
    TChatConversationStatus,
    TChatRequest,
    TFollowUpConsumedEvent,
    TChatRequestHuman,
    TSensitiveOperation,
    TXpertChatState,
    TXpertChatResumeRequest,
    TXpertChatRetryRequest,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { catchError, concat, concatMap, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { uniq } from 'lodash'
import { CancelSummaryJobCommand } from '../../../chat-conversation/commands/cancel-summary.command'
import { ScheduleSummaryJobCommand } from '../../../chat-conversation/commands/schedule-summary.command'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { ChatConversationGoalService } from '../../../chat-conversation/goal'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { appendMessageSteps, sanitizeMessageContentForPersistence } from '../../../chat-message'
import { ChatMessageUpsertCommand } from '../../../chat-message/commands/upsert.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands/chat.command'
import { XpertService } from '../../xpert.service'
import { XpertChatCommand } from '../chat.command'
import { CreateMemoryStoreCommand } from '../../../shared/commands/create-memory-store.command'
import { getDisabledSkillIds } from '../../../shared/agent/tool-preference'
import { hydrateHumanInput, hydrateSendRequestHumanInput, normalizeReferences } from '../../../shared/agent/human-input'
import { hasExplicitPlanModeFlag, isPlanModeEnabledFromState } from '../../../shared/agent/plan-mode'
import {
    collectPendingFollowUpsByClientMessageId,
    findPendingFollowUpByClientMessageId
} from '../../../shared/agent/persisted-follow-up'
import { normalizeChatState } from '../../../shared/agent/utils'
import {
    getRuntimeCapabilitiesFromState,
    hasExplicitRuntimeCapabilities,
    normalizeRuntimeCapabilitiesSelection,
    TRuntimeCapabilitiesSelection
} from '../../../shared/agent/runtime-capabilities'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries/get-one.query'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { AssistantBindingService } from '../../../assistant-binding/assistant-binding.service'
import { RedisSseStreamService } from '../../../shared/stream'
import { AttachFileToConversationCommand } from '../../../file-understanding'
import { applicationMetrics } from '../../../metrics'
import { applicationTracing } from '../../../tracing'

function readBooleanMarker(container: unknown, property: string): boolean {
    return !!container && typeof container === 'object' && Reflect.get(container, property) === true
}

function readObjectProperty(container: unknown, property: string): unknown {
    if (!container || typeof container !== 'object' || Array.isArray(container)) {
        return null
    }
    return Reflect.get(container, property)
}

function isInternalGoalRunInput(input: TChatRequestHuman | null | undefined): boolean {
    const metadata = readObjectProperty(input, 'goalRunMetadata')
    return (
        readBooleanMarker(input, 'goalRun') ||
        readBooleanMarker(input, 'internalGoalRun') ||
        readBooleanMarker(input, 'xpertInternalGoalRun') ||
        readBooleanMarker(metadata, 'internal') ||
        readBooleanMarker(metadata, 'xpertInternalGoalRun')
    )
}

function resolveVisibleConversationTitle(
    conversationTitle: string | null | undefined,
    executionTitle: string | null | undefined,
    fallbackInput: string | null | undefined,
    internalGoalRunInput: string | null | undefined
) {
    const existingTitle =
        internalGoalRunInput?.trim() && conversationTitle?.trim() === internalGoalRunInput.trim()
            ? null
            : conversationTitle
    return existingTitle || executionTitle || shortTitle(fallbackInput || '')
}

@CommandHandler(XpertChatCommand)
export class XpertChatHandler implements ICommandHandler<XpertChatCommand> {
    readonly #logger = new Logger(XpertChatHandler.name)

    constructor(
        private readonly xpertService: XpertService,
        private readonly assistantBindingService: AssistantBindingService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly goalService: ChatConversationGoalService,
        private readonly redisSseStreamService?: RedisSseStreamService
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
        const hydratedRequest = hydrateSendRequestHumanInput<TChatRequest>(request)
        const hydratedSendRequest =
            request.action === 'send' ? (hydratedRequest as Extract<TChatRequest, { action: 'send' }>) : null
        const hydratedFollowUpRequest =
            request.action === 'follow_up' ? (hydratedRequest as Extract<TChatRequest, { action: 'follow_up' }>) : null
        const { options } = c
        const { xpertId, taskId, from, fromEndUserId } = options ?? {}
        const metricStart = Date.now()
        const metricAction = request.action
        const metricFrom = from
        let { execution } = options ?? {}
        const userId = RequestContext.currentUserId()
        const sendInput = request.action === 'send' ? request.message?.input : null
        const hydratedSendInput = hydratedSendRequest?.message?.input ?? null

        if (request.action === 'send' && !sendInput) {
            throw new BadRequestException('Invalid send request: message.input is required')
        }

        const rawSendInput = request.action === 'send' ? sendInput : null
        const isGoalRun = isInternalGoalRunInput(rawSendInput)
        const titleInput =
            typeof rawSendInput?.input === 'string' && rawSendInput.input.trim().length > 0
                ? rawSendInput.input
                : undefined
        let input: TChatRequestHuman | null = hydratedSendRequest
            ? normalizeChatState(hydratedSendRequest.state, hydratedSendInput)[STATE_VARIABLE_HUMAN]
            : request.action === 'resume'
              ? normalizeChatState(request.state)[STATE_VARIABLE_HUMAN]
              : null
        let state =
            request.action === 'retry'
                ? null
                : hydratedSendRequest
                  ? normalizeChatState(hydratedSendRequest.state, hydratedSendRequest.message.input)
                  : hydratedFollowUpRequest
                    ? normalizeChatState(hydratedFollowUpRequest.state, hydratedFollowUpRequest.message.input)
                    : normalizeChatState(request.state)

        if (request.action === 'follow_up') {
            const conversation = await this.queryBus.execute(
                new GetChatConversationQuery({ id: request.conversationId }, messageRelations())
            )
            if (!conversation) {
                throw new BadRequestException(`Conversation "${request.conversationId}" not found`)
            }
            const hasInterruptedWaitList =
                Array.isArray(conversation.operation?.tasks) && conversation.operation.tasks.length > 0
            const canPersistInterruptedSteerFollowUp =
                conversation.status === XpertAgentExecutionStatusEnum.INTERRUPTED &&
                request.mode === 'steer' &&
                hasInterruptedWaitList
            if (
                conversation.status === XpertAgentExecutionStatusEnum.INTERRUPTED &&
                !canPersistInterruptedSteerFollowUp
            ) {
                throw new BadRequestException('Follow-up is not available while the conversation is interrupted')
            }

            const followUpInput = request.message.input
            const hydratedFollowUpInput = normalizeChatState(
                hydratedFollowUpRequest?.state,
                hydratedFollowUpRequest?.message.input
            )[STATE_VARIABLE_HUMAN]
            const references = normalizeReferences(followUpInput.references)

            if (
                !hydratedFollowUpInput?.input?.trim() &&
                references.length === 0 &&
                (!Array.isArray(followUpInput.files) || followUpInput.files.length === 0)
            ) {
                throw new BadRequestException('Follow-up input is required')
            }

            const targetMessage = resolveFollowUpTargetMessage(request, conversation.messages)
            const targetExecutionId =
                targetMessage?.executionId ?? request.target?.executionId ?? options?.execution?.id ?? null
            const existingPendingFollowUp = findPendingFollowUpByClientMessageId(
                conversation.messages,
                request.message.clientMessageId
            )

            const followUpFileAssets = toFileAssetReferences(followUpInput.files)
            const followUpLegacyAttachments = toLegacyStorageFileAttachments(followUpInput.files)

            await this.commandBus.execute(
                new ChatMessageUpsertCommand({
                    ...(existingPendingFollowUp?.id ? { id: existingPendingFollowUp.id } : {}),
                    parent: targetMessage ?? conversation.messages?.[conversation.messages.length - 1] ?? null,
                    role: 'human',
                    content: followUpInput.input,
                    conversationId: conversation.id,
                    ...(references.length
                        ? {
                              references
                          }
                        : {}),
                    ...(followUpLegacyAttachments.length
                        ? {
                              attachments: followUpLegacyAttachments
                          }
                        : {}),
                    ...(followUpFileAssets.length
                        ? {
                              fileAssets: followUpFileAssets
                          }
                        : {}),
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
            const followUpXpert = xpertId
                ? await this.xpertService.findOne(xpertId, { relations: ['agent'] }).catch(() => null)
                : null
            await attachFileAssetsToConversation(this.commandBus, conversation, followUpInput.files, {
                xpertId: followUpXpert?.id ?? xpertId,
                projectId: options.projectId,
                sandboxProvider: followUpXpert
                    ? figureOutXpert(followUpXpert as IXpert, Boolean(options?.isDraft)).features?.sandbox?.provider
                    : undefined
            })
            applicationMetrics.recordChatRequest({
                action: metricAction,
                from: metricFrom,
                status: 'queued',
                durationMs: Date.now() - metricStart
            })

            return EMPTY
        }

        const timeStart = Date.now()

        const xpert = await this.xpertService.findOne(xpertId, { relations: ['agent', 'knowledgebase'] })
        const [userPreference, clawXpertBinding] = await Promise.all([
            this.assistantBindingService.getUserPreferenceByAssistantId(xpertId),
            this.assistantBindingService.getBinding(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)
        ])
        const latestXpert = figureOutXpert(xpert, options?.isDraft)
        const forceWorkspaceSkillBlacklistMode = clawXpertBinding?.assistantId === xpertId
        const abortController = new AbortController()
        /**
         * @deprecated use memory middlewares
         */
        const memory = latestXpert.memory
        /**
         * @deprecated use memory middlewares
         */
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
        /**
         * @deprecated use memory middlewares
         */
        let memories = null

        let conversation: IChatConversation
        let aiMessage: CopilotChatMessage
        let executionId: string
        let checkpointId: string = null
        let queueFollowUpConsumedEvent: TFollowUpConsumedEvent | null = null
        let goalRunVisibleInput: string | null = null
        const requestedSandboxEnvironmentId = resolveRequestSandboxEnvironmentId(request)
        // Resume continues an interrupted AI turn in place by reusing the existing
        // conversation, target AI message, and execution instead of creating a new run.
        if (request.action === 'resume') {
            conversation = await this.queryBus.execute(
                new GetChatConversationQuery({ id: request.conversationId }, messageRelations())
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
            if (!hasExplicitPlanModeFlag(state) || !hasExplicitRuntimeCapabilities(state)) {
                const targetExecution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(executionId))
                const inheritedRuntimeCapabilities = !hasExplicitRuntimeCapabilities(state)
                    ? getRuntimeCapabilitiesFromState(targetExecution?.inputs)
                    : null
                if (isPlanModeEnabledFromState(targetExecution?.inputs) || inheritedRuntimeCapabilities) {
                    state = normalizeChatState({
                        ...state,
                        [STATE_VARIABLE_HUMAN]: {
                            ...(state[STATE_VARIABLE_HUMAN] ?? {}),
                            ...(isPlanModeEnabledFromState(targetExecution?.inputs) ? { planMode: true } : {}),
                            ...(inheritedRuntimeCapabilities
                                ? { runtimeCapabilities: inheritedRuntimeCapabilities }
                                : {})
                        }
                    })
                    input = state[STATE_VARIABLE_HUMAN]
                }
            }

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

                if (
                    request.action === 'send' &&
                    requestedSandboxEnvironmentId &&
                    conversation.options?.sandboxEnvironmentId !== requestedSandboxEnvironmentId
                ) {
                    conversation = await this.commandBus.execute(
                        new ChatConversationUpsertCommand(
                            {
                                id: conversation.id,
                                options: {
                                    ...(conversation.options ?? {}),
                                    sandboxEnvironmentId: requestedSandboxEnvironmentId
                                }
                            },
                            messageRelations()
                        )
                    )
                }

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
                                parameters: input,
                                ...(requestedSandboxEnvironmentId
                                    ? {
                                          sandboxEnvironmentId: requestedSandboxEnvironmentId
                                      }
                                    : {})
                            },
                            from,
                            fromEndUserId
                        },
                        messageRelations()
                    )
                )

                // Remember
                if (memory?.enabled && memory.profile?.enabled && memoryStore) {
                    memories = await getLongTermMemory(memoryStore, xpertId, input.input)
                }
            }

            if (isGoalRun) {
                const goal = await this.goalService.getByConversationId(conversation.id)
                goalRunVisibleInput = goal?.objective?.trim() || null
            }

            let userMessage: IChatMessage = null
            const persistedPendingFollowUpGroup =
                request.action === 'send'
                    ? collectPendingFollowUpsByClientMessageId(conversation.messages, request.message.clientMessageId)
                    : null
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
                checkpointId = request.checkpointId
                    ? request.checkpointId
                    : await this.resolveRetryInputCheckpointId(
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
                    ...(userMessage.references?.length
                        ? {
                              references: userMessage.references
                          }
                        : {}),
                    ...(getMessageFiles(userMessage).length
                        ? {
                              files: getMessageFiles(userMessage)
                          }
                        : {})
                }
                input = resolveRetryHumanInput(sourceExecution.inputs, fallbackRetryState as TChatRequestHuman)
                state = normalizeChatState(undefined, input)
            }

            if (request.action !== 'retry' && persistedPendingFollowUpGroup?.matched?.id) {
                const rawMergedInput = persistedPendingFollowUpGroup.mergedHumanInput
                input = hydrateHumanInput(rawMergedInput)
                state = normalizeChatState(request.state, input)

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

                queueFollowUpConsumedEvent = createFollowUpConsumedEvent({
                    mode: 'queue',
                    messageIds: persistedPendingFollowUpGroup.messageIds,
                    clientMessageIds: persistedPendingFollowUpGroup.clientMessageIds,
                    executionId: persistedPendingFollowUpGroup.targetExecutionId,
                    visibleAt: visibleAt.toISOString()
                })
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
                if (persistedPendingFollowUpGroup?.matched?.id) {
                    // Pending follow-ups were already merged into graph state and
                    // marked consumed before the execution was created.
                } else {
                    const persistedInput = rawSendInput ?? input
                    const visibleInput = isGoalRun ? goalRunVisibleInput : persistedInput?.input
                    const references = normalizeReferences(persistedInput?.references)
                    const persistedRuntimeCapabilities =
                        getRuntimeCapabilitiesFromState(state) ??
                        normalizeRuntimeCapabilitiesSelection(persistedInput?.runtimeCapabilities)
                    const fileAssets = toFileAssetReferences(persistedInput?.files)
                    const legacyAttachments = toLegacyStorageFileAttachments(persistedInput?.files)
                    const thirdPartyMessage =
                        persistedRuntimeCapabilities || persistedInput?.commandSource || isGoalRun
                            ? {
                                  ...(isGoalRun
                                      ? {
                                            internalGoalRun: true
                                        }
                                      : {}),
                                  ...(persistedRuntimeCapabilities
                                      ? {
                                            runtimeCapabilities: persistedRuntimeCapabilities
                                        }
                                      : {}),
                                  ...(persistedInput?.commandSource
                                      ? {
                                            commandSource: persistedInput.commandSource
                                        }
                                      : {})
                              }
                            : null
                    const _humanMessage: Partial<IChatMessage> = {
                        parent: conversation.messages[conversation.messages.length - 1],
                        role: 'human',
                        content: visibleInput,
                        conversationId: conversation.id,
                        ...(references.length
                            ? {
                                  references
                              }
                            : {}),
                        ...(legacyAttachments.length
                            ? {
                                  attachments: legacyAttachments
                              }
                            : {}),
                        ...(fileAssets.length
                            ? {
                                  fileAssets
                              }
                            : {}),
                        ...(thirdPartyMessage
                            ? {
                                  thirdPartyMessage
                              }
                            : {})
                    }
                    userMessage = await this.commandBus.execute(new ChatMessageUpsertCommand(_humanMessage))
                    await attachFileAssetsToConversation(this.commandBus, conversation, persistedInput?.files, {
                        xpertId: xpert.id,
                        projectId: options.projectId,
                        sandboxProvider: figureOutXpert(xpert as IXpert, Boolean(options?.isDraft)).features?.sandbox
                            ?.provider
                    })
                }
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
        const preparedAgentChatState = prepareAgentChatState({
            state,
            input,
            conversationRuntimeCapabilities: conversation.options?.runtimeCapabilities,
            workspaceId: latestXpert?.workspaceId ?? xpert.workspaceId,
            userPreference,
            forceWorkspaceSkillBlacklistMode
        })
        state = preparedAgentChatState.state
        input = preparedAgentChatState.input
        const runtimeCapabilities = preparedAgentChatState.runtimeCapabilities
        const visibleConversationTitleInput = isGoalRun ? goalRunVisibleInput : titleInput || input?.input

        const stream = new Observable<MessageEvent>((subscriber) => {
            let chatMetricsFinished = false
            applicationMetrics.startChat({ from: metricFrom })
            const finishChatMetrics = (status: string) => {
                if (chatMetricsFinished) {
                    return
                }
                chatMetricsFinished = true
                applicationMetrics.finishChat({
                    action: metricAction,
                    from: metricFrom,
                    status,
                    durationMs: Date.now() - metricStart
                })
            }

            // New conversation
            subscriber.next({
                data: {
                    type: ChatMessageTypeEnum.EVENT,
                    event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
                    data: {
                        id: conversation.id,
                        title: resolveVisibleConversationTitle(
                            conversation.title,
                            null,
                            visibleConversationTitleInput,
                            isGoalRun ? titleInput : null
                        ),
                        status: conversation.status,
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
                    const { projectId: sandboxProjectId, sandboxEnvironmentId } = resolveAgentSandboxScope(
                        request,
                        conversation,
                        options
                    )
                    agentObservable = await this.commandBus.execute<
                        XpertAgentChatCommand,
                        Promise<Observable<MessageEvent>>
                    >(
                        new XpertAgentChatCommand(state, xpert.agent.key, xpert, {
                            ...(options ?? {}),
                            projectId: sandboxProjectId,
                            sandboxEnvironmentId,
                            store: memoryStore,
                            conversationId: conversation.id,
                            isDraft: options?.isDraft,
                            toolPreferences: userPreference?.toolPreferences ?? null,
                            runtimeCapabilities,
                            planMode: isPlanModeEnabledFromState(state),
                            execution: { id: executionId, category: 'agent' },
                            resume:
                                request.action === 'resume'
                                    ? {
                                          decision: request.decision,
                                          ...(request.patch ? { patch: request.patch } : {})
                                      }
                                    : undefined,
                            memories,
                            checkpointId: checkpointId
                        })
                    )
                }

                let _execution = null
                let operation: TSensitiveOperation = null
                let pendingSteerAssistantParentId: string | null = null
                const messageAppendContextTracker = createMessageAppendContextTracker()
                concat(
                    agentObservable.pipe(
                        concatMap(async (event) => {
                            if (pendingSteerAssistantParentId && shouldStartAssistantMessageAfterSteer(event)) {
                                aiMessage = await this.commandBus.execute(
                                    new ChatMessageUpsertCommand({
                                        parent: { id: pendingSteerAssistantParentId } as IChatMessage,
                                        role: 'ai',
                                        content: ``,
                                        executionId,
                                        conversationId: conversation.id,
                                        status: 'thinking'
                                    })
                                )
                                pendingSteerAssistantParentId = null

                                subscriber.next({
                                    data: {
                                        type: ChatMessageTypeEnum.EVENT,
                                        event: ChatMessageEventTypeEnum.ON_MESSAGE_START,
                                        data: { ...aiMessage, status: 'thinking' }
                                    }
                                } as MessageEvent)
                            }

                            if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
                                const { messageContext } = messageAppendContextTracker.resolve({
                                    incoming: event.data.data,
                                    fallbackSource: typeof event.data.data === 'string' ? 'memory_reply' : undefined,
                                    fallbackStreamId: aiMessage?.id ?? executionId
                                })

                                applicationMetrics.recordToolComponentMessage(event.data.data, aiMessage.content)
                                appendMessageContent(
                                    aiMessage,
                                    sanitizeMessageContentForPersistence(event.data.data),
                                    messageContext
                                )
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
                                        applicationMetrics.recordToolMessage(event.data.data)
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

                                        if (isFollowUpConsumedEvent(event.data.data)) {
                                            aiMessage.status = XpertAgentExecutionStatusEnum.SUCCESS
                                            aiMessage.error = null
                                            await this.commandBus.execute(new ChatMessageUpsertCommand(aiMessage))

                                            subscriber.next({
                                                data: {
                                                    type: ChatMessageTypeEnum.EVENT,
                                                    event: ChatMessageEventTypeEnum.ON_MESSAGE_END,
                                                    data: { ...aiMessage }
                                                }
                                            } as MessageEvent)

                                            pendingSteerAssistantParentId =
                                                event.data.data.messageIds[event.data.data.messageIds.length - 1] ??
                                                null
                                        }
                                        break
                                    }
                                }
                            }

                            return event
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
                                const metricStatus =
                                    _execution?.status === XpertAgentExecutionStatusEnum.ERROR ||
                                    status === XpertAgentExecutionStatusEnum.ERROR
                                        ? 'error'
                                        : _execution?.status === XpertAgentExecutionStatusEnum.INTERRUPTED
                                          ? 'interrupted'
                                          : 'success'
                                const _conversation = await this.commandBus.execute(
                                    new ChatConversationUpsertCommand({
                                        id: conversation.id,
                                        status: convStatus,
                                        title: resolveVisibleConversationTitle(
                                            conversation.title,
                                            _execution?.title,
                                            visibleConversationTitleInput,
                                            isGoalRun ? titleInput : null
                                        ),
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

                                finishChatMetrics(metricStatus)

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
                                finishChatMetrics('error')
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
                                            title: resolveVisibleConversationTitle(
                                                conversation.title,
                                                _execution?.title,
                                                visibleConversationTitleInput,
                                                isGoalRun ? titleInput : null
                                            ),
                                            options: conversation.options
                                        })
                                    )
                                    finishChatMetrics('aborted')
                                } catch (err) {
                                    finishChatMetrics('error')
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
                    finishChatMetrics('error')
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

        const persistedStream =
            this.redisSseStreamService?.wrapChatStream(stream, {
                target: options?.streamPersistence,
                threadId: conversation.threadId,
                runId: executionId
            }) ?? stream

        return applicationTracing.traceObservable(persistedStream, 'xpert.chat', {
            'xpert.chat.action': request.action,
            'xpert.chat.from': from,
            'conversation.id': conversation.id,
            'thread.id': conversation.threadId,
            'execution.id': executionId,
            'xpert.id': xpert.id,
            'project.id': options.projectId
        })
    }
}

function isFollowUpConsumedEvent(value: unknown): value is TFollowUpConsumedEvent {
    return (
        !!value &&
        typeof value === 'object' &&
        (value as TFollowUpConsumedEvent).type === CHAT_EVENT_TYPE_FOLLOW_UP_CONSUMED &&
        (value as TFollowUpConsumedEvent).mode === 'steer' &&
        Array.isArray((value as TFollowUpConsumedEvent).messageIds)
    )
}

function shouldStartAssistantMessageAfterSteer(event: MessageEvent) {
    if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
        return true
    }

    if (event.data.type !== ChatMessageTypeEnum.EVENT) {
        return false
    }

    return [ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, ChatMessageEventTypeEnum.ON_INTERRUPT].includes(
        event.data.event as ChatMessageEventTypeEnum
    )
}

/**
 * Normalizes the chat state before invoking the agent, including inherited
 * runtime capabilities, user preference context, and skill selection metadata.
 */
function prepareAgentChatState({
    state,
    input,
    conversationRuntimeCapabilities,
    workspaceId,
    userPreference,
    forceWorkspaceSkillBlacklistMode = false
}: {
    state: TXpertChatState | null
    input: TChatRequestHuman | null
    conversationRuntimeCapabilities?: unknown
    workspaceId?: string | null
    userPreference?: {
        soul?: string | null
        profile?: string | null
        toolPreferences?: IAssistantBindingToolPreferences | null
    } | null
    forceWorkspaceSkillBlacklistMode?: boolean
}): {
    state: TXpertChatState
    input: TChatRequestHuman | null
    runtimeCapabilities: TRuntimeCapabilitiesSelection | null
} {
    let preparedState = state ?? normalizeChatState(undefined, input)
    let preparedInput = input

    if (!hasExplicitRuntimeCapabilities(preparedState) && conversationRuntimeCapabilities) {
        preparedState = withRuntimeCapabilitiesState(preparedState, conversationRuntimeCapabilities)
        preparedInput = preparedState[STATE_VARIABLE_HUMAN] ?? preparedInput
    }

    preparedState = withPreferenceSystemState(preparedState, userPreference)

    const requestedRuntimeCapabilities = getRuntimeCapabilitiesFromState(preparedState)
    const runtimeCapabilities = filterRuntimeCapabilitiesBySkillPreference(
        requestedRuntimeCapabilities,
        workspaceId,
        userPreference?.toolPreferences
    )
    if (runtimeCapabilities) {
        preparedState = withRuntimeCapabilitiesState(preparedState, runtimeCapabilities)
        if (runtimeCapabilities !== requestedRuntimeCapabilities) {
            preparedInput = preparedState[STATE_VARIABLE_HUMAN] ?? preparedInput
        }
    }

    preparedState = withPreferenceSkillState(
        preparedState,
        workspaceId,
        userPreference?.toolPreferences,
        forceWorkspaceSkillBlacklistMode,
        runtimeCapabilities
    )

    return {
        state: preparedState,
        input: preparedInput,
        runtimeCapabilities
    }
}

function withPreferenceSystemState(
    state: TXpertChatState,
    preference?: {
        soul?: string | null
        profile?: string | null
    } | null
): TXpertChatState {
    return {
        ...state,
        [STATE_VARIABLE_SYS]: {
            ...(state?.[STATE_VARIABLE_SYS] ?? {}),
            soul: preference?.soul ?? null,
            profile: preference?.profile ?? null
        }
    }
}

function withRuntimeCapabilitiesState(state: TXpertChatState, runtimeCapabilities: unknown): TXpertChatState {
    return normalizeChatState({
        ...state,
        [STATE_VARIABLE_HUMAN]: {
            ...(state?.[STATE_VARIABLE_HUMAN] ?? {}),
            runtimeCapabilities
        }
    })
}

function filterRuntimeCapabilitiesBySkillPreference(
    runtimeCapabilities: TRuntimeCapabilitiesSelection | null,
    workspaceId?: string | null,
    toolPreferences?: IAssistantBindingToolPreferences | null
) {
    if (runtimeCapabilities?.mode !== 'allowlist') {
        return runtimeCapabilities
    }

    const normalizedWorkspaceId = runtimeCapabilities.skills?.workspaceId?.trim() || workspaceId?.trim() || undefined
    const disabledSkillIds = normalizedWorkspaceId ? getDisabledSkillIds(normalizedWorkspaceId, toolPreferences) : []

    if (!disabledSkillIds.length) {
        return runtimeCapabilities
    }

    const disabledSkillIdSet = new Set(disabledSkillIds)
    const skillIds = runtimeCapabilities.skills.ids.filter((skillId) => !disabledSkillIdSet.has(skillId))
    if (skillIds.length === runtimeCapabilities.skills.ids.length) {
        return runtimeCapabilities
    }

    return {
        ...runtimeCapabilities,
        skills: {
            ...runtimeCapabilities.skills,
            ids: skillIds
        }
    }
}

function withPreferenceSkillState(
    state: TXpertChatState,
    workspaceId?: string | null,
    toolPreferences?: IAssistantBindingToolPreferences | null,
    forceWorkspaceSkillBlacklistMode = false,
    runtimeCapabilities?: TRuntimeCapabilitiesSelection | null
): TXpertChatState {
    const normalizedWorkspaceId = runtimeCapabilities?.skills?.workspaceId?.trim() || workspaceId?.trim() || undefined

    if (runtimeCapabilities?.mode === 'allowlist') {
        const disabledSkillIds = normalizedWorkspaceId
            ? getDisabledSkillIds(normalizedWorkspaceId, toolPreferences)
            : []
        const disabledSkillIdSet = new Set(disabledSkillIds)
        return {
            ...state,
            selectedSkillWorkspaceId: normalizedWorkspaceId,
            selectedSkillIds: (runtimeCapabilities.skills?.ids ?? []).filter(
                (skillId) => !disabledSkillIdSet.has(skillId)
            ),
            disabledSkillIds,
            skillSelectionMode: undefined
        }
    }

    return {
        ...state,
        selectedSkillWorkspaceId: normalizedWorkspaceId,
        disabledSkillIds: normalizedWorkspaceId
            ? getDisabledSkillIds(normalizedWorkspaceId, toolPreferences)
            : undefined,
        skillSelectionMode:
            normalizedWorkspaceId && forceWorkspaceSkillBlacklistMode ? 'workspace_blacklist' : undefined
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

function messageRelations() {
    // Keep both relations loaded while retry/follow-up can replay historical
    // StorageFile attachments and new FileAsset handles in the same thread.
    return ['messages', 'messages.attachments', 'messages.fileAssets']
}

type FileAssetHandle = {
    id: string
    storageFileId?: string
}

async function attachFileAssetsToConversation(
    commandBus: CommandBus,
    conversation: Pick<IChatConversation, 'id' | 'threadId'>,
    files: unknown,
    context?: {
        xpertId?: string
        projectId?: string
        sandboxProvider?: string | null
    }
) {
    const fileAssets = toFileAssetHandles(files)
    if (!conversation?.id || !fileAssets.length) {
        return
    }

    // Attach before invoking the agent so built-in file tools can enforce the
    // conversation boundary and workspace projection has the final run context.
    await Promise.all(
        fileAssets.map((file) =>
            commandBus.execute(
                new AttachFileToConversationCommand({
                    fileAssetId: file.id,
                    conversationId: conversation.id,
                    storageFileId: file.storageFileId,
                    threadId: conversation.threadId,
                    projectId: context?.projectId,
                    xpertId: context?.xpertId,
                    sandboxProvider: context?.sandboxProvider
                })
            )
        )
    )
}

function toFileAssetReferences(files: unknown): Array<{ id: string }> {
    return toFileAssetHandles(files).map((file) => ({ id: file.id }))
}

/**
 * Normalizes new ChatKit `AgentFile` handles into FileAsset relation stubs.
 * StorageFile-only legacy inputs intentionally fall through to the deprecated
 * attachment bridge below.
 */
function toFileAssetHandles(files: unknown): FileAssetHandle[] {
    if (!Array.isArray(files)) {
        return []
    }

    const seen = new Set<string>()
    const handles = files
        .map<FileAssetHandle | null>((file) => {
            if (!file || typeof file !== 'object') {
                return null
            }
            const record = file as Record<string, unknown>
            const storageFileId = typeof record.storageFileId === 'string' ? record.storageFileId : undefined
            const fileAssetId =
                typeof record.fileAssetId === 'string'
                    ? record.fileAssetId
                    : storageFileId && typeof record.id === 'string'
                      ? record.id
                      : null
            return typeof fileAssetId === 'string'
                ? {
                      id: fileAssetId,
                      storageFileId
                  }
                : null
        })
        .filter((file): file is FileAssetHandle => Boolean(file))

    return handles.filter((file) => {
        if (seen.has(file.id)) {
            return false
        }
        seen.add(file.id)
        return true
    })
}

/**
 * @deprecated Use `toFileAssetReferences` and persist `fileAssets`. This bridge
 * only preserves old clients that still submit StorageFile-shaped attachments
 * without a `storageFileId`.
 */
function toLegacyStorageFileAttachments(files: unknown): IStorageFile[] {
    if (!Array.isArray(files)) {
        return []
    }

    return files
        .map((file) => {
            if (!file || typeof file !== 'object') {
                return null
            }
            const record = file as Record<string, unknown>
            if (typeof record.storageFileId === 'string') {
                return null
            }
            return typeof record.id === 'string'
                ? ({
                      ...record,
                      id: record.id
                  } as unknown as IStorageFile)
                : null
        })
        .filter((file): file is IStorageFile => Boolean(file))
}

function getMessageFiles(message: IChatMessage): unknown[] {
    // Retry reconstructs the original human input from persisted relations.
    // Prefer FileAsset handles, but append StorageFile attachments for old runs.
    const fileAssets = Array.isArray(message.fileAssets)
        ? message.fileAssets.map((file) => ({
              id: file.id,
              fileId: file.id,
              storageFileId: file.storageFileId,
              originalName: file.originalName,
              mimeType: file.mimeType,
              size: file.size,
              status: file.status,
              parseStatus: file.status,
              parseMode: file.parseMode,
              purpose: file.purpose,
              capabilities: file.capabilities,
              summary: file.summary,
              workspacePath: file.workspacePath
          }))
        : []
    const legacyAttachments = Array.isArray(message.attachments) ? message.attachments : []
    return [...fileAssets, ...legacyAttachments]
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

function resolveFollowUpTargetMessage(
    request: Extract<TChatRequest, { action: 'follow_up' }>,
    messages?: IChatMessage[] | null
) {
    if (request.target?.aiMessageId) {
        return messages?.find((message) => message.id === request.target?.aiMessageId) ?? null
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

function resolveRequestProjectId(request: TChatRequest): string | undefined {
    return 'projectId' in request ? request.projectId?.trim() || undefined : undefined
}

function resolveRequestSandboxEnvironmentId(request: TChatRequest): string | undefined {
    return 'sandboxEnvironmentId' in request ? request.sandboxEnvironmentId?.trim() || undefined : undefined
}

function resolveAgentSandboxScope(
    request: TChatRequest,
    conversation: IChatConversation,
    options?: XpertChatCommand['options']
) {
    const sandboxEnvironmentId =
        options?.sandboxEnvironmentId?.trim() ||
        resolveRequestSandboxEnvironmentId(request) ||
        conversation.options?.sandboxEnvironmentId?.trim() ||
        undefined

    return {
        sandboxEnvironmentId,
        projectId: sandboxEnvironmentId
            ? undefined
            : options?.projectId?.trim() ||
              resolveRequestProjectId(request) ||
              conversation.projectId?.trim() ||
              undefined
    }
}
