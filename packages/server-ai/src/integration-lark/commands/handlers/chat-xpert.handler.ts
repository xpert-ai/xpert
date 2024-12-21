import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import { XpertChatCommand } from '../../../xpert/index'
import { LarkConversationService } from '../../conversation.service'
import { LarkChatXpertCommand } from '../chat-xpert.command'

@CommandHandler(LarkChatXpertCommand)
export class LarkChatXpertHandler implements ICommandHandler<LarkChatXpertCommand> {
	readonly #logger = new Logger(LarkChatXpertHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly conversationService: LarkConversationService
	) {}

	public async execute(command: LarkChatXpertCommand) {
		const { xpertId, input, larkMessage } = command
		const userId = RequestContext.currentUserId()

		const conversationId = await this.conversationService.getConversation(userId, xpertId)

		const observable = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
			new XpertChatCommand(
				{
					input: {
						input
					},
					xpertId,
					conversationId
				},
				null
			)
		)

		let responseMessageContent = ''
		observable.subscribe({
			next: (event) => {
				if (event.data) {
					const message = event.data
					if (message.type === ChatMessageTypeEnum.MESSAGE) {
						if (typeof message.data === 'string') {
							responseMessageContent += message.data
						} else {
							console.log(`未处理的消息：`, message)
							if (message.data.type === 'update') {
								larkMessage.update(message.data.data)
							}
						}
					} else if (message.type === ChatMessageTypeEnum.EVENT) {
						switch (message.event) {
							case ChatMessageEventTypeEnum.ON_CONVERSATION_START: {
								this.conversationService
									.setConversation(userId, xpertId, message.data.id)
									.catch((err) => {
										this.#logger.error(err)
									})
								break
							}
						}
					}
				} else {
					console.log(event)
				}
			},
			error: (error) => {
				console.error(error)
			},
			complete: () => {
				console.log('End chat with lark')
				if (responseMessageContent) {
					larkMessage.update({
						status: XpertAgentExecutionStatusEnum.SUCCESS,
						elements: [{ tag: 'markdown', content: responseMessageContent }]
					})
				}
			}
		})
	}
}
