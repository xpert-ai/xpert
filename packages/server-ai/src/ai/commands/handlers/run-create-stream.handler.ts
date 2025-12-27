import { TChatRequest, TInterruptCommand, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { isNil, omitBy } from 'lodash'
import { map } from 'rxjs/operators'
import { ChatConversationUpsertCommand, GetChatConversationQuery } from '../../../chat-conversation'
import { FindXpertQuery, XpertChatCommand } from '../../../xpert'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { RunCreateStreamCommand } from '../run-create-stream.command'

@CommandHandler(RunCreateStreamCommand)
export class RunCreateStreamHandler implements ICommandHandler<RunCreateStreamCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: RunCreateStreamCommand) {
		const threadId = command.threadId
		const runCreate = command.runCreate
		const chatRequest = runCreate.input as unknown as TChatRequest

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
					input: chatRequest.input as any,
					xpertId: xpert.id,
					conversationId: conversation.id,
					command: chatRequest['command'] as TInterruptCommand
				},
				{
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
