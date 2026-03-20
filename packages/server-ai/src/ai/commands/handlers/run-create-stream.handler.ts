import { TChatRequest, XpertAgentExecutionStatusEnum } from '@metad/contracts'
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

export function validateRunCreateInput(input: unknown): TChatRequest {
    const parsed = chatRequestSchema.safeParse(input)
    if (!parsed.success) {
        throw new BadRequestException(
            parsed.error.issues.map(({ message, path }) => `${path.join('.')}: ${message}`).join('; ')
        )
    }

    return parsed.data as TChatRequest
}

function withThreadConversationContext(input: unknown, conversationId: string): TChatRequest {
    const request = validateRunCreateInput(input)

    switch (request.action) {
        case 'send':
            return {
                ...request,
                conversationId
            }
        case 'resume':
            return {
                ...request,
                conversationId
            }
        case 'retry':
            return {
                ...request,
                conversationId
            }
    }
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

        // Find thread (conversation) and assistant (xpert)
        const conversation = await this.queryBus.execute(new GetChatConversationQuery({ threadId }))
        const xpert = await this.queryBus.execute(new FindXpertQuery({ id: runCreate.assistant_id }, {}))
        const chatRequest = withThreadConversationContext(runCreate.input, conversation.id)

        // Update xpert id for chat conversation
        if (!conversation.xpertId) {
            conversation.xpertId = xpert.id
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
                sandboxEnvironmentId:
                    chatRequest.action === 'send' || chatRequest.action === 'retry'
                        ? chatRequest.sandboxEnvironmentId
                        : undefined
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
