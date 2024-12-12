import {
	ChatMessageTypeEnum,
	CopilotChatMessage,
	IChatConversation,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Observable, tap } from 'rxjs'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/index'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/index'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands'
import { XpertService } from '../../xpert.service'
import { XpertChatContinueCommand } from '../continue.command'
import { appendMessageContent } from './chat.handler'

@CommandHandler(XpertChatContinueCommand)
export class XpertChatContinueHandler implements ICommandHandler<XpertChatContinueCommand> {
	readonly #logger = new Logger(XpertChatContinueHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertChatContinueCommand): Promise<Observable<MessageEvent>> {
		const { options } = command
		const { xpertId, input, conversationId, toolCalls } = command.request

		const timeStart = Date.now()

		const xpert = await this.xpertService.findOne(xpertId, { relations: ['agent'] })

		const conversation: IChatConversation = await this.queryBus.execute(
			new GetChatConversationQuery({ id: conversationId }, [])
		)

		const aiMessage: CopilotChatMessage = conversation.messages[conversation.messages.length - 1]
		const executionId = aiMessage.executionId
		let status = XpertAgentExecutionStatusEnum.SUCCESS
		let error = null
		let result = ''

		const agentObservable = await this.commandBus.execute<XpertAgentChatCommand, Promise<Observable<MessageEvent>>>(
			new XpertAgentChatCommand(input, xpert.agent.key, xpert, {
				...(options ?? {}),
				isDraft: options?.isDraft,
				execution: { id: executionId },
				toolCalls
			})
		)

		return new Observable<MessageEvent>((subscriber) => {
			agentObservable
				.pipe(
					tap({
						next: (event) => {
							if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
								appendMessageContent(aiMessage, event.data.data)
								if (typeof event.data.data === 'string') {
									result += event.data.data
								}
							}
						},
						error: (err) => {
							status = XpertAgentExecutionStatusEnum.ERROR
							error = getErrorMessage(err)
						},
						finalize: async () => {
							try {
								const timeEnd = Date.now()
								// Record End time
								const entity =
									status === XpertAgentExecutionStatusEnum.ERROR
										? {
												id: executionId,
												elapsedTime: timeEnd - timeStart,
												status,
												error,
												outputs: {
													output: result
												}
											}
										: {
												id: executionId,
												elapsedTime: timeEnd - timeStart,
												outputs: {
													output: result
												}
											}
								const _execution = await this.commandBus.execute(
									new XpertAgentExecutionUpsertCommand(entity)
								)

								// Update ai message
								aiMessage.status = _execution.status
								await this.commandBus.execute(
									new ChatConversationUpsertCommand({
										...conversation,
										messages: [
											...conversation.messages.slice(0, conversation.messages.length - 1),
											aiMessage
										]
									})
								)
							} catch (err) {
								//
							}
						}
					})
				)
				.subscribe(subscriber)

			return () => {
				//
			}
		})
	}
}
