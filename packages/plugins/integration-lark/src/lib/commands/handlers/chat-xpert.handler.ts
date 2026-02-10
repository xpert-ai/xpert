import { SerializedConstructor } from '@langchain/core/load/serializable'
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	LanguagesEnum,
	messageContentText,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatLarkMessage } from '../../chat/message'
import { LarkConversationService } from '../../conversation.service'
import { LarkChatXpertCommand } from '../chat-xpert.command'

function createUnavailableChatApi() {
	return {
		chatXpert: async (..._args: any[]): Promise<any> => {
			throw new Error('Chat service is not available in Lark plugin context')
		},
		upsertChatMessage: async (..._args: any[]): Promise<any> => {
			throw new Error('Chat service is not available in Lark plugin context')
		},
	}
}

@CommandHandler(LarkChatXpertCommand)
export class LarkChatXpertHandler implements ICommandHandler<LarkChatXpertCommand> {
	private readonly logger = new Logger(LarkChatXpertHandler.name)
	private readonly chat = createUnavailableChatApi()

	constructor(private readonly conversationService: LarkConversationService) {}

	public async execute(command: LarkChatXpertCommand) {
		const { xpertId, input, larkMessage } = command
		const userId = RequestContext.currentUserId()

		const conversationId = await this.conversationService.getConversation(userId, xpertId)

		// Thinking message
		await larkMessage.update({ status: 'thinking' })

			const observable = await this.chat.chatXpert(
				{
					input: {
						input
					},
					conversationId,
					confirm: command.options?.confirm
				},
				{
					xpertId,
					from: 'feishu',
					fromEndUserId: userId,
					tenantId: RequestContext.currentTenantId(),
					organizationId: RequestContext.getOrganizationId(),
					user: RequestContext.currentUser(),
					language: larkMessage.language as LanguagesEnum,
					// Channel context for notification middleware
					channelType: 'lark',
					integrationId: larkMessage.integrationId,
					chatId: larkMessage.chatId,
				channelUserId: larkMessage.senderOpenId // Use Lark sender's open_id
			}
		)

		return new Promise((resolve, reject) => {
			let responseMessageContent = ''
			observable.subscribe({
				next: (event) => {
					if (event.data) {
						const message = event.data
						if (message.type === ChatMessageTypeEnum.MESSAGE) {
							responseMessageContent += messageContentText(message.data)
							if (typeof message.data === 'string') {
								//
							} else if (message.data) {
								if (message.data.type === 'update') {
									larkMessage.update(message.data.data)
								} else if (message.data.type !== 'text') {
									this.logger.warn(`Unprocessed messages: `, message)
								}
							}
						} else if (message.type === ChatMessageTypeEnum.EVENT) {
							switch (message.event) {
								case ChatMessageEventTypeEnum.ON_CONVERSATION_START: {
									this.conversationService
										.setConversation(userId, xpertId, message.data.id)
										.catch((err) => {
											this.logger.error(err)
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
											this.logger.error(err)
										})
									} else if (message.data.status === XpertAgentExecutionStatusEnum.ERROR) {
										larkMessage.error(message.data.error || `Internal Error`).catch((err) => {
											this.logger.error(err)
										})
									}
									break
								}
								case ChatMessageEventTypeEnum.ON_AGENT_START:
								case ChatMessageEventTypeEnum.ON_AGENT_END:
								case ChatMessageEventTypeEnum.ON_MESSAGE_END: {
									break
								}
								default: {
									this.logger.warn(`Unprocessed events: `, message)
								}
							}
						}
					} else {
						this.logger.warn(`Unrecognized event: `, event)
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
								this.logger.error(error)
							})
					} else if (command.options?.reject) {
						larkMessage
							.update({
								status: XpertAgentExecutionStatusEnum.SUCCESS,
								elements: []
							})
							.catch((error) => {
								this.logger.error(error)
							})
					}

					this.saveLarkMessage(larkMessage)
						.then(() => resolve(larkMessage))
						.catch((error) => {
							this.logger.error(error)
							reject(error)
						})
				}
			})
		})
	}

	async saveLarkMessage(message: ChatLarkMessage) {
		if (message.messageId) {
			await this.chat.upsertChatMessage({
				id: message.messageId,
				thirdPartyMessage: (message.toJSON() as SerializedConstructor).kwargs
			})
		}
	}
}
