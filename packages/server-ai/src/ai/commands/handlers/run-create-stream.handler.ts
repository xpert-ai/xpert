import {
    IChatConversation,
    IEnvironment,
    TChatRequest as TChatRequestV2,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { TChatRequest as LegacyTChatRequest } from '@xpert-ai/chatkit-types'
import { BadRequestException, Logger, Optional } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { isNil, omitBy } from 'lodash'
import { map } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { t } from 'i18next'
import z from 'zod'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { ChatConversationThreadService } from '../../../chat-conversation/conversation-thread.service'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { AssertChatConversationAccessQuery } from '../../../chat-conversation/queries/conversation-assert-access.query'
import { EnvironmentService, getContextEnvState, mergeEnvironmentWithEnvState } from '../../../environment'
import { PublishedXpertAccessService, XpertPrincipalService } from '../../../xpert'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { AssertXpertAgentExecutionAccessQuery } from '../../../xpert-agent-execution/queries'
import { XpertProjectService } from '../../../xpert-project'
import { RunCreateStreamCommand } from '../run-create-stream.command'
import { assertPublicXpertSessionConversationAccess } from '../../public-xpert-principal'
import { getTrustedApiChatSource } from '../../api-chat-source'
import { serializeRunStreamPayload } from '../../../shared/stream/'
import {
    applyAssistantScope,
    bindConversationProjectIfUnbound,
    bindConversationAssistantIfUnbound,
    resolveAssistantForRequest
} from '../../assistant-request-context'

const humanInputSchema = z.object({}).passthrough()

const stateSchema = z.record(z.any())

const interruptPatchSchema = z
    .object({
        agentKey: z.string().optional(),
        toolCalls: z.array(z.any()).optional(),
        update: z.any().optional()
    })
    .passthrough()

const resumeDecisionSchema = z
    .object({
        type: z.union([z.literal('confirm'), z.literal('reject')]),
        payload: z.any().optional()
    })
    .passthrough()

const targetSchema = z
    .object({
        aiMessageId: z.string().optional(),
        executionId: z.string().optional()
    })
    .passthrough()

const sendChatRequestSchema = z
    .object({
        action: z.literal('send'),
        conversationId: z.string().optional(),
        projectId: z.string().optional(),
        environmentId: z.string().optional(),
        sandboxEnvironmentId: z.string().optional(),
        message: z
            .object({
                clientMessageId: z.string().optional(),
                input: humanInputSchema
            })
            .passthrough(),
        state: stateSchema.optional()
    })
    .passthrough()

const resumeChatRequestSchema = z
    .object({
        action: z.literal('resume'),
        conversationId: z.string().optional(),
        target: targetSchema,
        decision: resumeDecisionSchema,
        patch: interruptPatchSchema.optional(),
        state: stateSchema.optional()
    })
    .passthrough()

const retryChatRequestSchema = z
    .object({
        action: z.literal('retry'),
        conversationId: z.string().optional(),
        source: targetSchema,
        environmentId: z.string().optional(),
        sandboxEnvironmentId: z.string().optional()
    })
    .passthrough()

const followUpChatRequestSchema = z
    .object({
        action: z.literal('follow_up'),
        conversationId: z.string().optional(),
        mode: z.union([z.literal('queue'), z.literal('steer')]),
        message: z
            .object({
                clientMessageId: z.string().optional(),
                input: humanInputSchema
            })
            .passthrough(),
        target: targetSchema.optional(),
        state: stateSchema.optional()
    })
    .passthrough()

const chatRequestSchema = z.discriminatedUnion('action', [
    sendChatRequestSchema,
    resumeChatRequestSchema,
    retryChatRequestSchema,
    followUpChatRequestSchema
])

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeRunStreamMessage(message: MessageEvent): MessageEvent {
    const payload = message.data
    const nextPayload = serializeRunStreamPayload(payload)

    if (nextPayload !== payload) {
        return {
            ...message,
            data: nextPayload
        }
    }

    return message
}

function isLegacyChatRequest(input: unknown): input is LegacyTChatRequest {
    return (
        isRecord(input) &&
        !('action' in input) &&
        ('input' in input ||
            'confirm' in input ||
            'command' in input ||
            'retry' in input ||
            'executionId' in input ||
            'agentKey' in input ||
            'sandboxEnvironmentId' in input)
    )
}

function toLegacyResumeDecision(input: LegacyTChatRequest) {
    return omitBy(
        {
            type: input.confirm === false ? 'reject' : 'confirm',
            payload: input.command?.resume
        },
        isNil
    )
}

function toLegacyInterruptPatch(input: LegacyTChatRequest) {
    const patch = omitBy(
        {
            agentKey: input.command?.agentKey ?? input.agentKey,
            toolCalls: input.command?.toolCalls,
            update: input.command?.update
        },
        isNil
    )

    return Object.keys(patch).length ? patch : undefined
}

function normalizeLegacyChatRequest(
    input: LegacyTChatRequest,
    options?: { isConversationBusy?: boolean }
): Record<string, unknown> {
    const followUpMode = (input as LegacyTChatRequest & { followUpMode?: 'queue' | 'steer' }).followUpMode

    if (followUpMode && options?.isConversationBusy) {
        return omitBy(
            {
                action: 'follow_up',
                conversationId: input.conversationId,
                mode: followUpMode,
                target: omitBy(
                    {
                        aiMessageId: input.id,
                        executionId: input.executionId
                    },
                    isNil
                ),
                message: omitBy(
                    {
                        clientMessageId: input.id,
                        input: input.input
                    },
                    isNil
                ),
                state: input.state
            },
            isNil
        )
    }

    if (input.retry) {
        return omitBy(
            {
                action: 'retry',
                conversationId: input.conversationId,
                environmentId: input.environmentId,
                sandboxEnvironmentId: input.sandboxEnvironmentId,
                source: omitBy(
                    {
                        aiMessageId: input.id,
                        executionId: input.executionId
                    },
                    isNil
                )
            },
            isNil
        )
    }

    if (input.confirm !== undefined || input.command !== undefined || input.executionId !== undefined) {
        return omitBy(
            {
                action: 'resume',
                conversationId: input.conversationId,
                target: omitBy(
                    {
                        aiMessageId: input.id,
                        executionId: input.executionId
                    },
                    isNil
                ),
                decision: toLegacyResumeDecision(input),
                patch: toLegacyInterruptPatch(input),
                state: input.state
            },
            isNil
        )
    }

    return omitBy(
        {
            action: 'send',
            conversationId: input.conversationId,
            projectId: input.projectId,
            environmentId: input.environmentId,
            sandboxEnvironmentId: input.sandboxEnvironmentId,
            agentKey: input.agentKey,
            message: omitBy(
                {
                    clientMessageId: input.id,
                    input: input.input
                },
                isNil
            ),
            state: input.state
        },
        isNil
    )
}

function normalizeRunCreateInput(input: unknown, options?: { isConversationBusy?: boolean }): unknown {
    if (!isRecord(input)) {
        return input
    }

    if (isLegacyChatRequest(input)) {
        return normalizeLegacyChatRequest(input, options)
    }

    if (!input.action) {
        return {
            ...input,
            action: 'send'
        }
    }

    return input
}

function getChatRequestEnvironmentId(chatRequest: TChatRequestV2): string | undefined {
    if (chatRequest.action === 'send' || chatRequest.action === 'retry') {
        return chatRequest.environmentId
    }

    return undefined
}

function getRunCreateContext(context: unknown): Record<string, unknown> | undefined {
    if (!isRecord(context)) {
        return undefined
    }

    return context
}

function getContextProjectId(context?: Record<string, unknown>): string | undefined {
    const direct = typeof context?.projectId === 'string' ? context.projectId : undefined
    const env = isRecord(context?.env) ? context.env : undefined
    const nested = typeof env?.projectId === 'string' ? env.projectId : undefined
    return (direct ?? nested)?.trim() || undefined
}

export function validateRunCreateInput(
    input: LegacyTChatRequest | TChatRequestV2 | unknown,
    conversation: IChatConversation
): TChatRequestV2 {
    const parsed = chatRequestSchema.safeParse(
        normalizeRunCreateInput(input, {
            isConversationBusy: conversation?.status === 'busy'
        })
    )
    if (!parsed.success) {
        throw new BadRequestException(
            parsed.error.issues.map(({ message, path }) => `${path.join('.')}: ${message}`).join('; ')
        )
    }

    if (parsed.data.conversationId && parsed.data.conversationId !== conversation.id) {
        throw new BadRequestException(
            t('server-ai:Error.RunConversationMismatch', {
                defaultValue: 'The requested conversation does not match the thread conversation'
            })
        )
    }

    return {
        ...parsed.data,
        conversationId: parsed.data.conversationId ?? conversation.id
    } as TChatRequestV2
}

@CommandHandler(RunCreateStreamCommand)
export class RunCreateStreamHandler implements ICommandHandler<RunCreateStreamCommand> {
    readonly #logger = new Logger(RunCreateStreamHandler.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly environmentService: EnvironmentService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService,
        private readonly xpertPrincipalService?: XpertPrincipalService,
        @Optional() private readonly projectService?: XpertProjectService,
        @Optional() private readonly conversationThreadService?: ChatConversationThreadService
    ) {}

    private async resolveRequestEnvironment(
        xpert: { environmentId?: string | null },
        chatRequest: TChatRequestV2,
        runtimeContext: Record<string, unknown> | undefined
    ): Promise<IEnvironment | undefined> {
        const environmentId = getChatRequestEnvironmentId(chatRequest) ?? xpert.environmentId ?? undefined

        let environment: IEnvironment | undefined
        if (environmentId) {
            environment = await this.environmentService.findOneForRuntime(environmentId)
        }

        return mergeEnvironmentWithEnvState(environment, getContextEnvState(runtimeContext))
    }

    public async execute(command: RunCreateStreamCommand) {
        const chatSource = getTrustedApiChatSource()
        const threadId = command.threadId
        const runCreate = command.runCreate

        // Resolve the runtime thread independently from its owning conversation.
        const conversationThread = this.conversationThreadService
            ? await this.conversationThreadService.requireByThreadId(threadId)
            : null
        let conversation =
            conversationThread?.conversation ??
            (await this.queryBus.execute(new GetChatConversationQuery({ threadId })))
        await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
        await this.queryBus.execute(new AssertChatConversationAccessQuery({ id: conversation.id }, 'contribute'))
        const xpert = await resolveAssistantForRequest(
            runCreate.assistant_id,
            this.publishedXpertAccessService,
            this.xpertPrincipalService
        )
        const chatRequest = validateRunCreateInput(runCreate.input, {
            ...conversation,
            status: conversationThread?.status ?? conversation.status
        })
        const runtimeContext = getRunCreateContext(runCreate.context)
        if (chatRequest.action === 'send' && !chatRequest.projectId) {
            chatRequest.projectId = getContextProjectId(runtimeContext)
        }

        const referencedExecutionId =
            chatRequest.action === 'retry'
                ? chatRequest.source.executionId
                : chatRequest.action === 'resume' || chatRequest.action === 'follow_up'
                  ? chatRequest.target?.executionId
                  : undefined
        const referencedExecution = referencedExecutionId
            ? await this.queryBus.execute(
                  new AssertXpertAgentExecutionAccessQuery(referencedExecutionId, 'contribute', conversation.threadId)
              )
            : null

        // Backfill legacy threads independently with a compare-and-set update.
        conversation = await bindConversationAssistantIfUnbound(
            this.commandBus,
            conversation,
            xpert,
            this.publishedXpertAccessService
        )
        // Project scope is persisted before streaming and then treated as the
        // sole trusted source for runtime files and nested Agent execution.
        const requestedProjectId = chatRequest.action === 'send' ? chatRequest.projectId : undefined
        const effectiveProjectId = conversation.projectId ?? requestedProjectId
        if (effectiveProjectId) {
            if (!this.projectService) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectConversationUnavailable', {
                        defaultValue: 'Project conversations are unavailable'
                    })
                )
            }
            // This must execute while RequestContext still represents the real
            // human actor, before the assistant technical principal is applied.
            await this.projectService.assertRuntimeAccess(effectiveProjectId, xpert.id)
        }
        conversation = await bindConversationProjectIfUnbound(this.commandBus, conversation, requestedProjectId)
        if (xpert.options?.workspaceScope?.mode === 'project-required' && !conversation.projectId) {
            throw new BadRequestException('This Assistant requires a Project workspace')
        }
        if (chatRequest.action === 'send' && conversation.projectId) {
            // Replace transient request scope with the authorized persisted id.
            chatRequest.projectId = conversation.projectId
        }

        applyAssistantScope(xpert)
        const environment = await this.resolveRequestEnvironment(xpert, chatRequest, runtimeContext)

        // Persist the sandbox option only when the request changes it.
        if (
            chatRequest.action === 'send' &&
            chatRequest.sandboxEnvironmentId &&
            conversation.options?.sandboxEnvironmentId !== chatRequest.sandboxEnvironmentId
        ) {
            conversation.options = {
                ...(conversation.options || {}),
                sandboxEnvironmentId: chatRequest.sandboxEnvironmentId
            }
            await this.commandBus.execute(new ChatConversationUpsertCommand(conversation))
        }

        const ownsRunClaim = chatRequest.action !== 'follow_up'
        if (ownsRunClaim && this.conversationThreadService) {
            await this.conversationThreadService.claimForRun(threadId)
        }
        let execution = chatRequest.action === 'follow_up' ? referencedExecution : null

        let stream: Observable<MessageEvent>
        try {
            if (!execution) {
                execution = await this.commandBus.execute(
                    new XpertAgentExecutionUpsertCommand(
                        omitBy(
                            {
                                id:
                                    chatRequest.action === 'resume'
                                        ? chatRequest.target.executionId
                                        : chatRequest.action === 'follow_up'
                                          ? chatRequest.target?.executionId
                                          : undefined,
                                threadId,
                                status: XpertAgentExecutionStatusEnum.RUNNING
                            },
                            isNil
                        )
                    )
                )
            }

            if (!execution?.id) {
                throw new BadRequestException('Execution ID could not be resolved')
            }

            stream = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
                new XpertChatCommand(chatRequest, {
                    xpertId: xpert.id,
                    threadId,
                    isDerivedThread: conversation.threadId !== threadId,
                    ...chatSource,
                    execution: chatRequest.action === 'resume' ? undefined : { id: execution.id },
                    ...(runtimeContext ? { context: runtimeContext } : {}),
                    environment,
                    sandboxEnvironmentId: conversation.options?.sandboxEnvironmentId,
                    projectId: conversation.projectId,
                    streamPersistence: {
                        transport: 'redis-stream',
                        threadId,
                        runId: execution.id
                    }
                })
            )
        } catch (error) {
            if (ownsRunClaim && this.conversationThreadService) {
                await this.conversationThreadService.updateRuntimeState(threadId, 'idle')
            }
            throw error
        }
        const normalizedStream = stream.pipe(map((message) => normalizeRunStreamMessage(message)))

        if (chatRequest.action === 'follow_up') {
            return {
                execution,
                stream: normalizedStream,
                streamTransport: 'direct' as const
            }
        }

        return {
            execution,
            stream: normalizedStream,
            streamTransport: 'redis' as const
        }
    }
}
