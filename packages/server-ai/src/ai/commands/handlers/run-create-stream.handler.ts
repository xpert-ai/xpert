import {
    ApiKeyBindingType,
    IApiKey,
    IApiPrincipal,
    IChatConversation,
    IEnvironment,
    IUser,
    IXpert,
    RequestScopeLevel,
    TChatRequest as TChatRequestV2,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { TChatRequest as LegacyTChatRequest } from '@xpert-ai/chatkit-types'
import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { isNil, omitBy } from 'lodash'
import { finalize, map, tap } from 'rxjs/operators'
import z from 'zod'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { AssistantBindingService } from '../../../assistant-binding'
import { EnvironmentService, getContextEnvState, mergeEnvironmentWithEnvState } from '../../../environment'
import { hydrateSendRequestHumanInput } from '../../../shared/agent'
import { PublishedXpertAccessService } from '../../../xpert'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { RunCreateStreamCommand } from '../run-create-stream.command'
import { RedisSseStreamService } from '../../stream/redis-sse.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'

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
        return hydrateSendRequestHumanInput(normalizeLegacyChatRequest(input, options))
    }

    if (!input.action) {
        return hydrateSendRequestHumanInput({
            ...input,
            action: 'send'
        })
    }

    return hydrateSendRequestHumanInput(input)
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

    return {
        ...parsed.data,
        conversationId: parsed.data.conversationId ?? conversation.id
    } as TChatRequestV2
}

function applyAssistantScopeToCurrentRequest(organizationId?: string | null) {
    const request = RequestContext.currentRequest() as any

    if (!request?.headers) {
        return
    }

    if (organizationId) {
        request.headers['organization-id'] = organizationId
        request.headers['x-scope-level'] = RequestScopeLevel.ORGANIZATION
        return
    }

    delete request.headers['organization-id']
    request.headers['x-scope-level'] = RequestScopeLevel.TENANT
}

function applyAssistantPrincipalToCurrentRequest(
    apiKey: IApiKey | null | undefined,
    principalUser: IUser | null | undefined
) {
    const request = RequestContext.currentRequest() as any
    const currentUser = RequestContext.currentUser() as IApiPrincipal | null

    if (!request || !apiKey || !principalUser) {
        return
    }

    // An explicit x-principal-user-id represents the business user for this
    // request and must not be overwritten by the xpert technical principal.
    if (currentUser?.requestedUserId) {
        return
    }

    request.user = {
        ...principalUser,
        apiKey,
        ownerUserId: currentUser?.ownerUserId ?? apiKey.createdById ?? principalUser.id ?? null,
        apiKeyUserId: currentUser?.apiKeyUserId ?? apiKey.userId ?? principalUser.id ?? null,
        requestedUserId: currentUser?.requestedUserId ?? null,
        requestedOrganizationId: currentUser?.requestedOrganizationId ?? null,
        principalType: currentUser?.principalType ?? 'api_key'
    }
}

function applyAssistantScope(xpert: IXpert) {
    const apiKey = RequestContext.currentApiKey()
    applyAssistantScopeToCurrentRequest(xpert.organizationId ?? null)
    applyAssistantPrincipalToCurrentRequest(apiKey, (xpert.user as IUser | null | undefined) ?? null)
}

@CommandHandler(RunCreateStreamCommand)
export class RunCreateStreamHandler implements ICommandHandler<RunCreateStreamCommand> {
    readonly #logger = new Logger(RunCreateStreamHandler.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly environmentService: EnvironmentService,
        private readonly redisSseStreamService: RedisSseStreamService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService,
        private readonly assistantBindingService: AssistantBindingService
    ) {}

    private async resolveAssistantForRun(assistantId: string) {
        const apiKey = RequestContext.currentApiKey()

        if (apiKey?.type === ApiKeyBindingType.ASSISTANT && apiKey.entityId && apiKey.entityId !== assistantId) {
            throw new ForbiddenException('API key is not allowed to access this assistant.')
        }

        const xpert = (await this.assistantBindingService.isEffectiveSystemAssistantId(assistantId))
            ? await this.publishedXpertAccessService.getPublishedXpertInTenant(assistantId, {
                  relations: ['user', 'createdBy']
              })
            : await this.publishedXpertAccessService.getAccessiblePublishedXpert(assistantId, {
                  relations: ['user', 'createdBy']
              })

        if (apiKey?.type === ApiKeyBindingType.WORKSPACE && apiKey.entityId && xpert.workspaceId !== apiKey.entityId) {
            throw new ForbiddenException('API key is not allowed to access this workspace assistant.')
        }

        return xpert
    }

    private async resolveRequestEnvironment(
        xpert: { environmentId?: string | null },
        chatRequest: TChatRequestV2,
        runtimeContext: Record<string, unknown> | undefined
    ): Promise<IEnvironment | undefined> {
        const environmentId = getChatRequestEnvironmentId(chatRequest) ?? xpert.environmentId ?? undefined

        let environment: IEnvironment | undefined
        if (environmentId) {
            environment = await this.environmentService.findOne(environmentId)
        }

        return mergeEnvironmentWithEnvState(environment, getContextEnvState(runtimeContext))
    }

    public async execute(command: RunCreateStreamCommand) {
        const threadId = command.threadId
        const runCreate = command.runCreate

        // Find thread (conversation) and assistant (xpert)
        const conversation = await this.queryBus.execute(new GetChatConversationQuery({ threadId }))
        const xpert = await this.resolveAssistantForRun(runCreate.assistant_id)
        applyAssistantScope(xpert)
        const chatRequest = validateRunCreateInput(runCreate.input, conversation)
        const runtimeContext = getRunCreateContext(runCreate.context)
        const environment = await this.resolveRequestEnvironment(xpert, chatRequest, runtimeContext)

        // Update conversation if xpertId is missing or sandboxEnvironmentId needs to be persisted
        let needsUpdate = false
        // Update xpert id for chat conversation
        if (!conversation.xpertId) {
            conversation.xpertId = xpert.id
            needsUpdate = true
        }
        if (
            chatRequest.action === 'send' &&
            chatRequest.sandboxEnvironmentId &&
            conversation.options?.sandboxEnvironmentId !== chatRequest.sandboxEnvironmentId
        ) {
            conversation.options = {
                ...(conversation.options || {}),
                sandboxEnvironmentId: chatRequest.sandboxEnvironmentId
            }
            needsUpdate = true
        }
        if (needsUpdate) {
            await this.commandBus.execute(new ChatConversationUpsertCommand(conversation))
        }

        let execution =
            chatRequest.action === 'follow_up' && chatRequest.target?.executionId
                ? await this.queryBus.execute(new XpertAgentExecutionOneQuery(chatRequest.target.executionId))
                : null

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
                            threadId: conversation.threadId,
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

        const stream = await this.commandBus.execute(
            new XpertChatCommand(chatRequest, {
                xpertId: xpert.id,
                from: 'api',
                execution: chatRequest.action === 'resume' ? undefined : { id: execution.id },
                ...(runtimeContext ? { context: runtimeContext } : {}),
                environment,
                sandboxEnvironmentId: conversation.options?.sandboxEnvironmentId
            })
        )
        const normalizedStream = stream.pipe(
            map((message) => {
                if (typeof message.data.data === 'object') {
                    return {
                        ...message,
                        data: {
                            ...message.data,
                            data: omitBy(message.data.data, isNil) // Remove null or undefined values
                        }
                    }
                }

                return message
            })
        )

        if (chatRequest.action === 'follow_up') {
            return {
                execution,
                stream: normalizedStream
            }
        }

        return {
            execution,
            stream: normalizedStream.pipe(
                tap((message) => {
                    this.redisSseStreamService.appendEvent(threadId, execution.id, message.data).catch((error) => {
                        this.#logger.warn(`Failed to persist SSE event: ${error}`)
                    })
                }),
                finalize(() => {
                    this.redisSseStreamService.appendCompleteEvent(threadId, execution.id).catch((error) => {
                        this.#logger.warn(`Failed to persist SSE complete event: ${error}`)
                    })
                })
            )
        }
    }
}
