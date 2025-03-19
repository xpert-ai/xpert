import { SerializedConstructor } from '@langchain/core/load/serializable'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, LanguagesEnum, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import { ChatMessageUpsertCommand } from '../../../chat-message'
import { XpertChatCommand } from '../../../xpert/index'
import { ChatLarkMessage } from '../../chat/message'
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

		// Thinking message
		await larkMessage.update({ status: 'thinking' })

		const observable = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
			new XpertChatCommand(
				{
					input: {
						input
					},
					xpertId,
					conversationId,
					confirm: command.options?.confirm,
					reject: command.options?.reject,
				},
				{
					from: 'feishu',
					fromEndUserId: userId,
					language: larkMessage.language as LanguagesEnum
				}
			)
		)

		return new Promise((resolve, reject) => {
			let responseMessageContent = ''
			observable.subscribe({
				next: (event) => {
					if (event.data) {
						const message = event.data
						if (message.type === ChatMessageTypeEnum.MESSAGE) {
							if (typeof message.data === 'string') {
								responseMessageContent += message.data
							} else {
								if (message.data?.type === 'update') {
									larkMessage.update(message.data.data)
								} else {
									console.log(`未处理的消息：`, message)
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
								case ChatMessageEventTypeEnum.ON_MESSAGE_START: {
									larkMessage.messageId = message.data.id
									break
								}
								case ChatMessageEventTypeEnum.ON_CONVERSATION_END: {
									if (
										message.data.status === XpertAgentExecutionStatusEnum.INTERRUPTED &&
										message.data.operation
									) {
										larkMessage.confirm(message.data.operation).catch((err) => {
											this.#logger.error(err)
										})
									} else if (message.data.status === XpertAgentExecutionStatusEnum.ERROR) {
										larkMessage.error(message.data.error || `Internal Error`).catch((err) => {
											this.#logger.error(err)
										})
									}
									break
								}
								default: {
									console.log(`未处理的事件: ${message.event}`)
								}
							}
						}
					} else {
						console.log(event)
					}
				},
				error: (error) => {
					console.error(error)
					reject(error)
				},
				complete: () => {
					// console.log('End chat with lark')
					if (responseMessageContent) {
						larkMessage
							.update({
								status: XpertAgentExecutionStatusEnum.SUCCESS,
								elements: [{ tag: 'markdown', content: responseMessageContent }]
							})
							.catch((error) => {
								this.#logger.error(error)
							})
					} else if (command.options?.reject) {
						larkMessage
							.update({
								status: XpertAgentExecutionStatusEnum.SUCCESS,
								elements: []
							})
							.catch((error) => {
								this.#logger.error(error)
							})
					}
	
					this.saveLarkMessage(larkMessage)
						.then(() => resolve(larkMessage))
						.catch((error) => {
							this.#logger.error(error)
							reject(error)
						})
				}
			})
		})
		
	}

	async saveLarkMessage(message: ChatLarkMessage) {
		if (message.messageId) {
			await this.commandBus.execute(
				new ChatMessageUpsertCommand({
					id: message.messageId,
					thirdPartyMessage: (message.toJSON() as SerializedConstructor).kwargs
				})
			)
		}
	}
}
