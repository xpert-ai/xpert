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
    IXpertAgentExecution,
    IXpert,
    LongTermMemoryTypeEnum,
    shortTitle,
    stringifyMessageContent,
    STATE_VARIABLE_HUMAN,
    STATE_VARIABLE_SYS,
    TChatConversationStatus,
    TChatRequest,
    TAssistantPrimaryModelSelection,
    TFollowUpConsumedEvent,
    TChatRequestHuman,
    TSensitiveOperation,
    TXpertChatState,
    TXpertChatResumeRequest,
    TXpertChatRetryRequest,
    XpertAgentExecutionStatusEnum,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import {
    BadRequestException,
    ForbiddenException,
    forwardRef,
    Inject,
    Logger,
    NotFoundException,
    Optional
} from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { AGENT_CHAT_DISPATCH_ERROR_STEER_TARGET_NOT_RUNNING, RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { catchError, concat, concatMap, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { uniq } from 'lodash'
import { CancelSummaryJobCommand } from '../../../chat-conversation/commands/cancel-summary.command'
import { ScheduleSummaryJobCommand } from '../../../chat-conversation/commands/schedule-summary.command'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { ChatConversationGoalService } from '../../../chat-conversation/goal'
import { ChatConversationThreadService } from '../../../chat-conversation/conversation-thread.service'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { appendMessageSteps, sanitizeMessageContentForPersistence } from '../../../chat-message'
import { ChatMessageUpsertCommand } from '../../../chat-message/commands/upsert.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands/chat.command'
import { XpertService } from '../../xpert.service'
import { AssistantModelSelectionService } from '../../assistant-model-selection.service'
import { sanitizeAssistantModelSnapshot } from '../../assistant-model-selection.util'
import { PublishedXpertAccessService } from '../../published-xpert-access.service'
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
    isRuntimeCapabilitiesAllowlist,
    normalizeRuntimeCapabilitiesSelection,
    TRuntimeCapabilitiesSelection
} from '../../../shared/agent/runtime-capabilities'
import { buildChatConversationSourceAudit, buildChatSourceExecutionMetadata } from '../../../shared/agent/source-audit'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries/get-one.query'
import { assertExecutionBelongsToThread } from '../../../xpert-agent-execution/execution-access'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { AssistantBindingService } from '../../../assistant-binding/assistant-binding.service'
import { RedisSseStreamService } from '../../../shared/stream'
import { applicationMetrics } from '../../../metrics'
import { applicationTracing } from '../../../tracing'
import { XpertProjectService } from '../../../xpert-project/project.service'
import { XpertProjectContentService } from '../../../xpert-project/services/project-content.service'
import {
    attachChatFileAssetsToConversation,
    getChatMessageFiles,
    normalizeChatHumanInputFiles,
    resolveChatReferenceFileAssets,
    toChatFileAssetReferences,
    toLegacyChatStorageFileAttachments
} from './chat-file-assets'

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

function supportsAssistantPrimaryModelSelection(xpert: Partial<IXpert> | null | undefined): boolean {
    return xpert?.type !== XpertTypeEnum.Knowledge
}

const STEER_FOLLOW_UP_TARGET_NOT_RUNNING_ERROR = 'Steer follow-up target execution is no longer running'

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
    private readonly logger = new Logger(XpertChatHandler.name)

    constructor(
        private readonly xpertService: XpertService,
        private readonly assistantBindingService: AssistantBindingService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly goalService: ChatConversationGoalService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService,
        private readonly redisSseStreamService?: RedisSseStreamService,
        @Optional()
        @Inject(forwardRef(() => XpertProjectService))
        private readonly projectService?: XpertProjectService,
        @Optional()
        @Inject(forwardRef(() => XpertProjectContentService))
        private readonly projectContentService?: XpertProjectContentService,
        @Optional() private readonly conversationThreadService?: ChatConversationThreadService,
        @Optional() private readonly assistantModelSelectionService?: AssistantModelSelectionService
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
        const conversationSourceAudit = buildChatConversationSourceAudit(options)
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

        const existingConversation = request.conversationId
            ? await this.queryBus.execute(
                  new GetChatConversationQuery({ id: request.conversationId }, messageRelations())
              )
            : null
        if (existingConversation) {
            await this.assertExistingConversationMutationAccess(existingConversation, xpertId, request, options)
        }

        let rawSendInput = request.action === 'send' ? sendInput : null
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
        let projectInstruction: string | null = null

        if (request.action === 'follow_up') {
            const conversation = existingConversation
            if (!conversation) {
                throw new BadRequestException(`Conversation "${request.conversationId}" not found`)
            }
            const activeThreadId = options?.threadId?.trim() || conversation.threadId
            await this.conversationThreadService?.hydrateConversationMessages(conversation, activeThreadId)
            const followUpSandboxScope = resolveAgentSandboxScope(request, conversation, options)
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

            const targetMessage = resolveFollowUpTargetMessage(request, conversation.messages)
            const targetExecutionId =
                targetMessage?.executionId ?? request.target?.executionId ?? options?.execution?.id ?? null
            if (request.mode === 'steer') {
                await this.assertSteerTargetIsActive(
                    targetExecutionId,
                    canPersistInterruptedSteerFollowUp,
                    conversation.threadId
                )
            }

            let followUpInput = request.message.input
            const followUpXpert = xpertId
                ? await this.xpertService
                      .findOneForRuntime(xpertId, { relations: ['agent', 'agent.copilotModel', 'copilotModel'] })
                      .catch(() => null)
                : null
            if (
                request.mode === 'queue' &&
                this.assistantModelSelectionService &&
                xpertId &&
                supportsAssistantPrimaryModelSelection(followUpXpert)
            ) {
                if (followUpXpert) {
                    const runtimeXpert = figureOutXpert(followUpXpert, options?.isDraft)
                    const selection = await this.assistantModelSelectionService.resolveSelection(runtimeXpert, {
                        explicitModelId: followUpInput.model
                    })
                    followUpInput = {
                        ...followUpInput,
                        model: selection.id
                    }
                }
            }
            // Follow-ups are persisted immediately as pending human messages, so
            // normalize files before deriving message.fileAssets or attachments.
            const normalizedFollowUpInput = await normalizeChatHumanInputFiles(followUpInput, {
                commandBus: this.commandBus,
                queryBus: this.queryBus,
                context: {
                    conversationId: conversation.id,
                    threadId: activeThreadId,
                    projectId: options.projectId ?? conversation.projectId,
                    xpertId,
                    workspaceDataScope: followUpXpert?.workspaceDataScope
                }
            })
            if (normalizedFollowUpInput.changed && normalizedFollowUpInput.input) {
                followUpInput = normalizedFollowUpInput.input
            }
            const hydratedFollowUpInput = normalizeChatState(hydratedFollowUpRequest?.state, followUpInput)[
                STATE_VARIABLE_HUMAN
            ]
            const references = normalizeReferences(followUpInput.references)
            const referenceFileAssets = await resolveChatReferenceFileAssets(references, {
                commandBus: this.commandBus,
                queryBus: this.queryBus,
                context: {
                    conversationId: conversation.id,
                    threadId: activeThreadId,
                    projectId: options.projectId ?? conversation.projectId,
                    xpertId
                }
            })
            const followUpFiles = [
                ...(Array.isArray(followUpInput.files) ? followUpInput.files : []),
                ...referenceFileAssets
            ]

            if (
                !hydratedFollowUpInput?.input?.trim() &&
                references.length === 0 &&
                (!Array.isArray(followUpInput.files) || followUpInput.files.length === 0)
            ) {
                throw new BadRequestException('Follow-up input is required')
            }

            const existingPendingFollowUp = findPendingFollowUpByClientMessageId(
                conversation.messages,
                request.message.clientMessageId
            )

            const followUpFileAssets = toChatFileAssetReferences(followUpFiles)
            const followUpLegacyAttachments = toLegacyChatStorageFileAttachments(followUpFiles)

            await this.commandBus.execute(
                new ChatMessageUpsertCommand({
                    ...(existingPendingFollowUp?.id ? { id: existingPendingFollowUp.id } : {}),
                    parent: targetMessage ?? conversation.messages?.[conversation.messages.length - 1] ?? null,
                    role: 'human',
                    content: followUpInput.input,
                    conversationId: conversation.id,
                    createdInThreadId: activeThreadId,
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
                        ...(request.mode === 'queue' && followUpInput.model ? { model: followUpInput.model } : {}),
                        followUpClientMessageId: request.message.clientMessageId ?? null
                    }
                })
            )
            // Close the RUNNING -> completion race around the pending-message insert.
            // If completion happened before the insert, this second check rejects and
            // the channel can safely resend with the same clientMessageId. If it happens
            // after this check, the execution's completion drain sees the inserted row.
            if (request.mode === 'steer') {
                await this.assertSteerTargetIsActive(
                    targetExecutionId,
                    canPersistInterruptedSteerFollowUp,
                    conversation.threadId
                )
            }
            await attachChatFileAssetsToConversation(this.commandBus, conversation, followUpFiles, {
                xpertId: followUpXpert?.id ?? xpertId,
                projectId: followUpSandboxScope.projectId,
                sandboxEnvironmentId: followUpSandboxScope.sandboxEnvironmentId,
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

        // Published assistant execution can be granted by UserGroup without workspace read membership.
        const xpert = await this.xpertService.findOneForRuntime(xpertId, {
            relations: ['agent', 'agent.copilotModel', 'copilotModel', 'knowledgebase']
        })
        const [userPreference, clawXpertBinding] = await Promise.all([
            this.assistantBindingService.getUserPreferenceByAssistantId(xpertId),
            this.assistantBindingService.getBinding(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)
        ])
        const latestXpert = figureOutXpert(xpert, options?.isDraft)
        // Assistant Tasks may target a named sub-Agent directly; ordinary chat
        // runs continue to start at the published primary Agent.
        const runtimeAgentKey = options?.agentKey?.trim() || xpert.agent.key
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
                    xpertId,
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
        let createdConversationForRequest = false
        let activeThreadId: string
        let isDerivedThread = Boolean(options?.isDerivedThread)
        let sourceModelExecution: IXpertAgentExecution | null = null
        let primaryModelSelection: TAssistantPrimaryModelSelection | null = null
        const requestedSandboxEnvironmentId = resolveRequestSandboxEnvironmentId(request)
        // Resume continues an interrupted AI turn in place by reusing the existing
        // conversation, target AI message, and execution instead of creating a new run.
        if (request.action === 'resume') {
            if (!existingConversation) {
                throw new BadRequestException(`Conversation "${request.conversationId}" not found`)
            }
            conversation = existingConversation
            activeThreadId = options?.threadId?.trim() || conversation.threadId
            isDerivedThread ||= activeThreadId !== conversation.threadId
            await this.conversationThreadService?.hydrateConversationMessages(conversation, activeThreadId)
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
            sourceModelExecution = assertExecutionBelongsToThread(
                await this.queryBus.execute(new XpertAgentExecutionOneQuery(executionId)),
                activeThreadId
            )
            if (!hasExplicitPlanModeFlag(state) || !hasExplicitRuntimeCapabilities(state)) {
                const targetExecution = sourceModelExecution
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
            if (!isDerivedThread && memory?.enabled && memory.profile?.enabled) {
                await this.commandBus.execute(new CancelSummaryJobCommand(conversation.id))
            }
        } else {
            // New message in conversation
            if (request.conversationId) {
                conversation = options?.isDerivedThread
                    ? await this.queryBus.execute(
                          new GetChatConversationQuery({ id: request.conversationId }, messageRelations())
                      )
                    : await this.commandBus.execute(
                          new ChatConversationUpsertCommand(
                              {
                                  id: request.conversationId,
                                  status: 'busy',
                                  error: null
                              },
                              messageRelations()
                          )
                      )
                activeThreadId = options?.threadId?.trim() || conversation.threadId
                isDerivedThread ||= activeThreadId !== conversation.threadId

                if (conversationSourceAudit) {
                    conversation = await this.commandBus.execute(
                        new ChatConversationUpsertCommand(
                            {
                                id: conversation.id,
                                sourceAudit: buildChatConversationSourceAudit(options, conversation.sourceAudit),
                                ...(from ? { from } : {}),
                                ...(fromEndUserId ? { fromEndUserId } : {})
                            },
                            messageRelations()
                        )
                    )
                }

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
                if (!isDerivedThread && memory?.enabled && memory.profile?.enabled) {
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
                            projectId: resolveRequestProjectId(request) ?? options?.projectId,
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
                            ...(conversationSourceAudit ? { sourceAudit: conversationSourceAudit } : {}),
                            from,
                            fromEndUserId
                        },
                        messageRelations()
                    )
                )
                createdConversationForRequest = true
                const primaryThread = await this.conversationThreadService?.ensurePrimary(conversation)
                activeThreadId = primaryThread?.threadId ?? conversation.threadId

                // Remember
                if (memory?.enabled && memory.profile?.enabled && memoryStore) {
                    memories = await getLongTermMemory(memoryStore, xpertId, input.input)
                }
            }

            activeThreadId ??= options?.threadId?.trim() || conversation.threadId
            await this.conversationThreadService?.hydrateConversationMessages(conversation, activeThreadId)

            // Once created, conversation.projectId is the trusted runtime scope;
            // reject any transient route/job value that attempts to cross it.
            const requestedProjectId = options.projectId ?? resolveRequestProjectId(request)
            if (conversation.projectId && requestedProjectId && conversation.projectId !== requestedProjectId) {
                throw new BadRequestException(
                    t('server-ai:Error.RequestedProjectConversationMismatch', {
                        defaultValue: 'The requested Project does not match the conversation Project'
                    })
                )
            }
            if (xpert.options?.workspaceScope?.mode === 'project-required' && !conversation.projectId) {
                throw new BadRequestException(
                    t('server-ai:Error.XpertProjectRequired', {
                        defaultValue: 'This Assistant requires a Project workspace'
                    })
                )
            }
            if (conversation.projectId && this.projectService) {
                await this.projectService.assertRuntimeAccess(conversation.projectId, xpert.id)
                if (this.projectContentService) {
                    projectInstruction = await this.projectContentService.readRuntimeInstructions(
                        conversation.projectId
                    )
                }
            }

            const attachmentSandboxScope = resolveAgentSandboxScope(request, conversation, options)
            if (request.action === 'send' && input) {
                // Conversation must exist first so new FileAssets can be linked
                // with conversation/thread/project context before execution.
                const normalizedInput = await normalizeChatHumanInputFiles(input, {
                    commandBus: this.commandBus,
                    queryBus: this.queryBus,
                    context: {
                        conversationId: conversation.id,
                        threadId: activeThreadId,
                        projectId: options.projectId ?? resolveRequestProjectId(request) ?? conversation.projectId,
                        xpertId: xpert.id,
                        workspaceDataScope: xpert.workspaceDataScope
                    }
                })
                if (normalizedInput.changed && normalizedInput.input) {
                    input = normalizedInput.input
                    state = normalizeChatState({
                        ...(state ?? {}),
                        [STATE_VARIABLE_HUMAN]: input
                    })
                    if (rawSendInput) {
                        rawSendInput = {
                            ...rawSendInput,
                            files: input.files
                        }
                    }
                    if (createdConversationForRequest) {
                        // New conversation creation initially stores raw request
                        // parameters; rewrite them so future retries/history use
                        // FileAsset handles instead of inline data URLs.
                        const updatedConversation = await this.commandBus.execute(
                            new ChatConversationUpsertCommand(
                                {
                                    id: conversation.id,
                                    options: {
                                        ...(conversation.options ?? {}),
                                        parameters: input
                                    }
                                },
                                messageRelations()
                            )
                        )
                        conversation = {
                            ...conversation,
                            ...updatedConversation,
                            threadId: activeThreadId,
                            messages: updatedConversation.messages ?? conversation.messages
                        }
                    }
                }
            }

            if (isGoalRun) {
                const goal = isDerivedThread
                    ? await this.goalService.getByConversationId(conversation.id, activeThreadId)
                    : await this.goalService.getByConversationId(conversation.id)
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
                const sourceExecution = assertExecutionBelongsToThread(
                    await this.queryBus.execute(new XpertAgentExecutionOneQuery(sourceExecutionId)),
                    activeThreadId
                )
                sourceModelExecution = sourceExecution
                checkpointId = request.checkpointId
                    ? request.checkpointId
                    : await this.resolveRetryInputCheckpointId(
                          sourceExecution.threadId ?? activeThreadId,
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
                    ...(getChatMessageFiles(userMessage).length
                        ? {
                              files: getChatMessageFiles(userMessage)
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

            // Resolve once at the root execution boundary. The audited snapshot is
            // then reused by resume/retry, so later preference or authoring changes
            // cannot silently switch the model inside an existing run.
            primaryModelSelection = await this.resolvePrimaryModelSelection({
                request,
                xpert: latestXpert,
                runtimeAgentKey,
                input,
                sourceExecution: sourceModelExecution
            })
            if (primaryModelSelection) {
                applicationMetrics.recordAssistantModelSelection(primaryModelSelection.source)
            }
            if (primaryModelSelection && input) {
                input = { ...input, model: primaryModelSelection.id }
                state = normalizeChatState({
                    ...(state ?? {}),
                    [STATE_VARIABLE_HUMAN]: input
                })
            }

            // New execution (Run) in thread
            const executionMetadata = buildChatSourceExecutionMetadata(options)
            const primaryModelMetadata = primaryModelSelection
                ? {
                      primaryModelId: primaryModelSelection.id,
                      primaryModelSource: primaryModelSelection.source,
                      primaryModelSnapshot: sanitizeAssistantModelSnapshot(primaryModelSelection.model)
                  }
                : null
            execution = await this.commandBus.execute(
                new XpertAgentExecutionUpsertCommand({
                    ...(execution ?? {}),
                    xpert: { id: xpert.id } as IXpert,
                    agentKey: runtimeAgentKey,
                    inputs: input,
                    status: XpertAgentExecutionStatusEnum.RUNNING,
                    threadId: activeThreadId,
                    ...(executionMetadata || primaryModelMetadata
                        ? {
                              metadata: {
                                  ...(execution?.metadata ?? {}),
                                  ...(executionMetadata ?? {}),
                                  ...(primaryModelMetadata ?? {})
                              }
                          }
                        : {})
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
                    const referenceFileAssets = await resolveChatReferenceFileAssets(references, {
                        commandBus: this.commandBus,
                        queryBus: this.queryBus,
                        context: {
                            conversationId: conversation.id,
                            threadId: activeThreadId,
                            projectId: options.projectId ?? resolveRequestProjectId(request) ?? conversation.projectId,
                            xpertId: xpert.id
                        }
                    })
                    const persistedFiles = [
                        ...(Array.isArray(persistedInput?.files) ? persistedInput.files : []),
                        ...referenceFileAssets
                    ]
                    const persistedRuntimeCapabilities =
                        getRuntimeCapabilitiesFromState(state) ??
                        normalizeRuntimeCapabilitiesSelection(persistedInput?.runtimeCapabilities)
                    const fileAssets = toChatFileAssetReferences(persistedFiles)
                    const legacyAttachments = toLegacyChatStorageFileAttachments(persistedFiles)
                    const thirdPartyMessage =
                        persistedRuntimeCapabilities ||
                        persistedInput?.commandSource ||
                        isGoalRun ||
                        primaryModelSelection
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
                                      : {}),
                                  ...(primaryModelSelection ? { model: primaryModelSelection.id } : {})
                              }
                            : null
                    const _humanMessage: Partial<IChatMessage> = {
                        parent: conversation.messages[conversation.messages.length - 1],
                        role: 'human',
                        content: visibleInput,
                        conversationId: conversation.id,
                        createdInThreadId: activeThreadId,
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
                    await attachChatFileAssetsToConversation(this.commandBus, conversation, persistedFiles, {
                        xpertId: xpert.id,
                        workspaceDataScope: xpert.workspaceDataScope,
                        projectId: attachmentSandboxScope.projectId,
                        sandboxEnvironmentId: attachmentSandboxScope.sandboxEnvironmentId,
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
                    createdInThreadId: activeThreadId,
                    status: 'thinking'
                })
            )
            await this.conversationThreadService?.advanceHead(activeThreadId, aiMessage.id)
        }
        if (request.action === 'resume') {
            primaryModelSelection = await this.resolvePrimaryModelSelection({
                request,
                xpert: latestXpert,
                runtimeAgentKey,
                input,
                sourceExecution: sourceModelExecution
            })
            if (primaryModelSelection) {
                applicationMetrics.recordAssistantModelSelection(primaryModelSelection.source)
            }
            if (primaryModelSelection && input) {
                input = { ...input, model: primaryModelSelection.id }
                state = normalizeChatState({
                    ...(state ?? {}),
                    [STATE_VARIABLE_HUMAN]: input
                })
            }
        }
        const preparedAgentChatState = prepareAgentChatState({
            state,
            input,
            conversationRuntimeCapabilities: conversation.options?.runtimeCapabilities,
            workspaceId: latestXpert?.workspaceId ?? xpert.workspaceId,
            userPreference,
            forceWorkspaceSkillBlacklistMode,
            assistantTaskSkillSelection: options?.assistantTaskSkillSelection
        })
        state = preparedAgentChatState.state
        state = {
            ...state,
            [STATE_VARIABLE_SYS]: {
                ...(state[STATE_VARIABLE_SYS] ?? {}),
                project_instruction: projectInstruction
            }
        }
        input = preparedAgentChatState.input
        const runtimeCapabilities = preparedAgentChatState.runtimeCapabilities
        const visibleConversationTitleInput = isGoalRun ? goalRunVisibleInput : titleInput || input?.input
        const logger = this.logger

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
                        new XpertAgentChatCommand(state, runtimeAgentKey, xpert, {
                            ...(options ?? {}),
                            ...(primaryModelSelection
                                ? {
                                      primaryCopilotModel: primaryModelSelection.model,
                                      primaryModelId: primaryModelSelection.id,
                                      primaryAgentKey: latestXpert.agent?.key,
                                      primaryModelSource: primaryModelSelection.source
                                  }
                                : {}),
                            thread_id: activeThreadId,
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
                                        createdInThreadId: activeThreadId,
                                        status: 'thinking'
                                    })
                                )
                                await this.conversationThreadService?.advanceHead(activeThreadId, aiMessage.id)
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
                                if (
                                    _execution?.status === XpertAgentExecutionStatusEnum.ERROR ||
                                    status === XpertAgentExecutionStatusEnum.ERROR
                                ) {
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
                                const resolvedTitle = resolveVisibleConversationTitle(
                                    conversation.title,
                                    _execution?.title,
                                    visibleConversationTitleInput,
                                    isGoalRun ? titleInput : null
                                )
                                await this.conversationThreadService?.updateRuntimeState(
                                    activeThreadId,
                                    convStatus,
                                    _execution?.error || error,
                                    operation
                                )
                                const _conversation = !isDerivedThread
                                    ? await this.commandBus.execute(
                                          new ChatConversationUpsertCommand({
                                              id: conversation.id,
                                              status: convStatus,
                                              title: resolvedTitle,
                                              operation,
                                              error: _execution?.error || error,
                                              options: conversation.options
                                          })
                                      )
                                    : {
                                          ...conversation,
                                          status: convStatus,
                                          operation,
                                          error: _execution?.error || error
                                      }

                                // Schedule summary job
                                if (
                                    !isDerivedThread &&
                                    memory?.enabled &&
                                    memory.profile?.enabled &&
                                    convStatus === 'idle'
                                ) {
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
                                logger.warn(err)
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
                                logger.debug(`Canceled by client!`)
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

                                    await this.conversationThreadService?.updateRuntimeState(activeThreadId, 'idle')
                                    if (!isDerivedThread) {
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
                                    }
                                    finishChatMetrics('aborted')
                                } catch (err) {
                                    finishChatMetrics('error')
                                    logger.error(err)
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
                threadId: activeThreadId,
                runId: executionId
            }) ?? stream

        return applicationTracing.traceObservable(persistedStream, 'xpert.chat', {
            'xpert.chat.action': request.action,
            'xpert.chat.from': from,
            'conversation.id': conversation.id,
            'thread.id': activeThreadId,
            'execution.id': executionId,
            'xpert.id': xpert.id,
            'project.id': options.projectId
        })
    }

    private async resolvePrimaryModelSelection({
        request,
        xpert,
        runtimeAgentKey,
        input,
        sourceExecution
    }: {
        request: TChatRequest
        xpert: Partial<IXpert>
        runtimeAgentKey: string
        input: TChatRequestHuman | null
        sourceExecution: IXpertAgentExecution | null
    }): Promise<TAssistantPrimaryModelSelection | null> {
        const primaryAgentKey = xpert.agent?.key
        if (
            !this.assistantModelSelectionService ||
            !supportsAssistantPrimaryModelSelection(xpert) ||
            !primaryAgentKey ||
            runtimeAgentKey !== primaryAgentKey
        ) {
            return null
        }

        const metadata = sourceExecution?.metadata
        if (request.action === 'resume') {
            return this.assistantModelSelectionService.resolveSelection(xpert, {
                continuationModelId: metadata?.primaryModelId,
                continuationModelSnapshot: metadata?.primaryModelSnapshot,
                continuationSource: metadata?.primaryModelSource,
                ignorePreference: !metadata?.primaryModelId
            })
        }
        if (request.action === 'retry') {
            return this.assistantModelSelectionService.resolveSelection(xpert, {
                retryModelId: metadata?.primaryModelId,
                retryModelSnapshot: metadata?.primaryModelSnapshot,
                ignorePreference: !metadata?.primaryModelId
            })
        }
        return this.assistantModelSelectionService.resolveSelection(xpert, {
            explicitModelId: typeof input?.model === 'string' ? input.model : undefined
        })
    }

    private async assertExistingConversationMutationAccess(
        conversation: IChatConversation,
        requestedXpertId: string | null | undefined,
        request: TChatRequest,
        options?: XpertChatCommand['options']
    ) {
        const persistedXpertId = conversation.xpertId?.trim() || undefined
        const normalizedRequestedXpertId = requestedXpertId?.trim() || undefined
        const sameXpertFamily =
            persistedXpertId && normalizedRequestedXpertId
                ? persistedXpertId === normalizedRequestedXpertId ||
                  (
                      await this.publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds(
                          normalizedRequestedXpertId
                      )
                  ).includes(persistedXpertId)
                : false
        if (!sameXpertFamily) {
            throw new BadRequestException(
                t('server-ai:Error.RequestedXpertConversationMismatch', {
                    defaultValue: 'The requested Xpert does not match the conversation Xpert'
                })
            )
        }

        const persistedProjectId = conversation.projectId?.trim() || undefined
        const optionProjectId = options?.projectId?.trim() || undefined
        const requestProjectId = resolveRequestProjectId(request)
        if (
            (optionProjectId && optionProjectId !== persistedProjectId) ||
            (requestProjectId && requestProjectId !== persistedProjectId)
        ) {
            throw new BadRequestException(
                t('server-ai:Error.RequestedProjectConversationMismatch', {
                    defaultValue: 'The requested Project does not match the conversation Project'
                })
            )
        }

        if (persistedProjectId) {
            if (!this.projectService) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectConversationUnavailable', {
                        defaultValue: 'Project conversations are unavailable'
                    })
                )
            }
            await this.projectService.assertRuntimeAccess(persistedProjectId, persistedXpertId)
            return
        }

        const actorUserId = RequestContext.currentUserId()
        if (!actorUserId || conversation.createdById !== actorUserId) {
            throw new ForbiddenException(
                t('server-ai:Error.ConversationAccessDenied', {
                    defaultValue: 'You do not have access to this conversation'
                })
            )
        }
    }

    private async assertSteerTargetIsActive(
        targetExecutionId: string | null,
        allowInterrupted: boolean,
        threadId: string
    ): Promise<void> {
        let targetExecution: { status?: XpertAgentExecutionStatusEnum; threadId?: string } | null = null
        if (targetExecutionId) {
            try {
                targetExecution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(targetExecutionId))
            } catch (error) {
                if (!(error instanceof NotFoundException)) {
                    throw error
                }
            }
        }
        if (targetExecution) {
            targetExecution = assertExecutionBelongsToThread(targetExecution, threadId)
        }
        const active =
            targetExecution?.status === XpertAgentExecutionStatusEnum.RUNNING ||
            (allowInterrupted && targetExecution?.status === XpertAgentExecutionStatusEnum.INTERRUPTED)
        if (!active) {
            throw new BadRequestException({
                code: AGENT_CHAT_DISPATCH_ERROR_STEER_TARGET_NOT_RUNNING,
                message:
                    t('server-ai:Error.SteerFollowUpTargetNotRunning', {
                        defaultValue: STEER_FOLLOW_UP_TARGET_NOT_RUNNING_ERROR
                    }) || STEER_FOLLOW_UP_TARGET_NOT_RUNNING_ERROR
            })
        }
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
    forceWorkspaceSkillBlacklistMode = false,
    assistantTaskSkillSelection
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
    assistantTaskSkillSelection?: {
        workspaceId: string
        skillIds: string[]
    }
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

    if (assistantTaskSkillSelection) {
        preparedState = withAssistantTaskSkillSelection(
            preparedState,
            assistantTaskSkillSelection,
            userPreference?.toolPreferences
        )
    }

    return {
        state: preparedState,
        input: preparedInput,
        runtimeCapabilities
    }
}

/**
 * Applies a host-validated Assistant Task skill selection without changing the
 * middleware capability selection. User-disabled skills still take precedence.
 */
function withAssistantTaskSkillSelection(
    state: TXpertChatState,
    selection: { workspaceId: string; skillIds: string[] },
    toolPreferences?: IAssistantBindingToolPreferences | null
): TXpertChatState {
    const workspaceId = selection.workspaceId.trim()
    const disabledSkillIds = getDisabledSkillIds(workspaceId, toolPreferences)
    const disabledSkillIdSet = new Set(disabledSkillIds)

    return {
        ...state,
        selectedSkillWorkspaceId: workspaceId,
        selectedSkillIds: selection.skillIds.filter((skillId) => !disabledSkillIdSet.has(skillId)),
        disabledSkillIds,
        // The host list is authoritative for this task; do not layer the
        // conversation's dynamic skill-selection mode on top of it.
        skillSelectionMode: undefined
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
    if (!isRuntimeCapabilitiesAllowlist(runtimeCapabilities)) {
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

    if (isRuntimeCapabilitiesAllowlist(runtimeCapabilities)) {
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
        projectId:
            options?.projectId?.trim() ||
            resolveRequestProjectId(request) ||
            conversation.projectId?.trim() ||
            undefined
    }
}
