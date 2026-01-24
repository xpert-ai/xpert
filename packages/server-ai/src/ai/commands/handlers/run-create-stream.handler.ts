import { STATE_VARIABLE_HUMAN, TChatRequest, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { isNil, omitBy } from 'lodash'
import { map } from 'rxjs/operators'
import z from 'zod'
import { ChatConversationUpsertCommand, GetChatConversationQuery } from '../../../chat-conversation'
import { FindXpertQuery, XpertChatCommand } from '../../../xpert'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { RunCreateStreamCommand } from '../run-create-stream.command'

const chatRequestSchema = z
	.object({
		input: z.union([
			z.string().min(1),
			z
				.object({
					input: z.string().min(1)
				})
				.passthrough()
		]),
		executionId: z.string().optional(),
		command: z.any().optional(),
		state: z.record(z.any()).optional(),
		conversationId: z.string().optional(),
		projectId: z.string().optional(),
		confirm: z.boolean().optional(),
		retry: z.boolean().optional(),
		checkpointId: z.string().optional()
	})
	.passthrough()

export function validateRunCreateInput(input: unknown): TChatRequest {
	const parsed = chatRequestSchema.parse(typeof input === 'string' ? { input } : input)
	const normalizedInput = typeof parsed.input === 'string' ? { input: parsed.input } : parsed.input
	const rawState = parsed.state && typeof parsed.state === 'object' && !Array.isArray(parsed.state) ? parsed.state : undefined

	return {
		...parsed,
		input: normalizedInput,
		state: rawState
			? {
					...rawState,
					[STATE_VARIABLE_HUMAN]: rawState[STATE_VARIABLE_HUMAN] ?? normalizedInput
			  }
			: { [STATE_VARIABLE_HUMAN]: normalizedInput }
	}
}

@CommandHandler(RunCreateStreamCommand)
export class RunCreateStreamHandler implements ICommandHandler<RunCreateStreamCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: RunCreateStreamCommand) {
		const threadId = command.threadId
		const runCreate = command.runCreate
		// Validate and normalize the incoming run input before handling chat request
		const chatRequest = validateRunCreateInput(runCreate.input)

		// Find thread (conversation) and assistant (xpert)
		const conversation = await this.queryBus.execute(new GetChatConversationQuery({ threadId }))
		const xpert = await this.queryBus.execute(new FindXpertQuery({ id: runCreate.assistant_id }, {}))

		// Update xpert id for chat conversation
		if (!conversation.xpertId) {
			conversation.xpertId = xpert.id
			await this.commandBus.execute(new ChatConversationUpsertCommand(conversation))
		}

		const execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand(
				omitBy(
					{
						id: chatRequest.executionId,
						threadId: conversation.threadId,
						status: XpertAgentExecutionStatusEnum.RUNNING
					},
					isNil
				)
			)
		)
		const stream = await this.commandBus.execute(
			new XpertChatCommand(
				{
					input: chatRequest.input,
					state: chatRequest.state,
					conversationId: conversation.id,
					command: chatRequest.command
				},
				{
					xpertId: xpert.id,
					from: 'api',
					execution
				}
			)
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
				})
			)
		}
	}
}
