import { IChatConversation, TChatRequest as TChatRequestV2, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { TChatRequest as LegacyTChatRequest } from '@xpert-ai/chatkit-types'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { isNil, omitBy } from 'lodash'
import { finalize, map, tap } from 'rxjs/operators'
import z from 'zod'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { FindXpertQuery } from '../../../xpert/queries/get-one.query'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { RunCreateStreamCommand } from '../run-create-stream.command'
import { RedisSseStreamService } from '../../stream/redis-sse.service'

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

const chatRequestSchema = z.discriminatedUnion('action', [
    sendChatRequestSchema,
    resumeChatRequestSchema,
    retryChatRequestSchema
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

function normalizeLegacyChatRequest(input: LegacyTChatRequest): Record<string, unknown> {
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

function normalizeRunCreateInput(input: unknown): unknown {
    if (!isRecord(input)) {
        return input
    }

    if (isLegacyChatRequest(input)) {
        return normalizeLegacyChatRequest(input)
    }

    if (!input.action) {
        return {
            ...input,
            action: 'send'
        }
    }

    return input
}

export function validateRunCreateInput(
    input: LegacyTChatRequest | TChatRequestV2 | unknown,
    conversation: IChatConversation
): TChatRequestV2 {
    const parsed = chatRequestSchema.safeParse(normalizeRunCreateInput(input))
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

@CommandHandler(RunCreateStreamCommand)
export class RunCreateStreamHandler implements ICommandHandler<RunCreateStreamCommand> {
    readonly #logger = new Logger(RunCreateStreamHandler.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly redisSseStreamService: RedisSseStreamService
    ) {}

    public async execute(command: RunCreateStreamCommand) {
        const threadId = command.threadId
        const runCreate = command.runCreate

        this.#logger.warn(
            `Received RunCreateStreamCommand for threadId ${threadId} with input: ${JSON.stringify(runCreate.input)}`
        )

        // Find thread (conversation) and assistant (xpert)
        const conversation = await this.queryBus.execute(new GetChatConversationQuery({ threadId }))
        const xpert = await this.queryBus.execute(new FindXpertQuery({ id: runCreate.assistant_id }, {}))
        const chatRequest = validateRunCreateInput(runCreate.input, conversation)

        this.#logger.warn(chatRequest, `validateRunCreateInput ${threadId}`)

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

        const execution = await this.commandBus.execute(
            new XpertAgentExecutionUpsertCommand(
                omitBy(
                    {
                        id: chatRequest.action === 'resume' ? chatRequest.target.executionId : undefined,
                        threadId: conversation.threadId,
                        status: XpertAgentExecutionStatusEnum.RUNNING
                    },
                    isNil
                )
            )
        )

        const stream = await this.commandBus.execute(
            new XpertChatCommand(chatRequest, {
                xpertId: xpert.id,
                from: 'api',
                execution: chatRequest.action === 'resume' ? undefined : execution,
                sandboxEnvironmentId: conversation.options?.sandboxEnvironmentId
            })
        )
        return {
            execution,
            stream: stream.pipe(
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
                }),
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
