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
import type { Subscription } from 'rxjs'
import { ChatLarkMessage } from '../../chat/message'
import { LarkConversationService } from '../../conversation.service'
import { LarkChatXpertCommand } from '../chat-xpert.command'
import { LarkCoreApi } from '../../lark-core-api.service'

@CommandHandler(LarkChatXpertCommand)
export class LarkChatXpertHandler implements ICommandHandler<LarkChatXpertCommand> {
	private readonly logger = new Logger(LarkChatXpertHandler.name)

	constructor(
		private readonly conversationService: LarkConversationService,
		private readonly core: LarkCoreApi
	) {}

	public async execute(command: LarkChatXpertCommand) {
		const { xpertId, input, larkMessage } = command
		const userId = RequestContext.currentUserId()
		const abortSignal = command.options?.abortSignal

		const conversationId = await this.conversationService.getConversation(userId, xpertId)
		const activeConversationId = await this.resolveActiveConversationId(
			userId,
			xpertId,
			conversationId
		)

		// Thinking message
		await larkMessage.update({ status: 'thinking' })

		const createObservable = async (nextConversationId?: string) =>
			this.core.chat.chatXpert(
				{
					input: {
						input
					},
					conversationId: nextConversationId,
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

		let observable
		try {
			observable = await createObservable(activeConversationId)
		} catch (error) {
			if (activeConversationId && isRecordNotFoundError(error)) {
				this.logger.warn(
					`Stale conversation cache detected for Lark user ${userId}, xpert ${xpertId}. Resetting cache and retrying once.`
				)
				await this.conversationService.clearConversation(userId, xpertId)
				observable = await createObservable(undefined)
			} else {
				throw error
			}
		}

		return new Promise((resolve, reject) => {
			let responseMessageContent = ''
			let settled = false
			let subscription: Subscription | null = null

			const completeWith = (handler: () => void) => {
				if (settled) {
					return
				}
				settled = true
				abortSignal?.removeEventListener('abort', onAbort)
				handler()
			}

			const onAbort = () => {
				this.logger.log(`Abort Lark xpert stream: integration=${larkMessage.integrationId}`)
				subscription?.unsubscribe()
				void (async () => {
					try {
						await larkMessage.update({
							status: XpertAgentExecutionStatusEnum.INTERRUPTED,
							elements: [
								{
									tag: 'markdown',
									content: 'Execution canceled.'
								}
							]
						})
						await this.saveLarkMessage(larkMessage)
					} catch (error) {
						this.logger.error(error)
					}
				})().finally(() => {
					completeWith(() => reject(new Error('Lark xpert execution aborted')))
				})
			}

			if (abortSignal?.aborted) {
				onAbort()
				return
			}

			if (abortSignal) {
				abortSignal.addEventListener('abort', onAbort, { once: true })
			}

			subscription = observable.subscribe({
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
					this.logger.error(error)
					completeWith(() => reject(error))
				},
				complete: () => {
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
						.then(() => completeWith(() => resolve(larkMessage)))
						.catch((error) => {
							this.logger.error(error)
							completeWith(() => reject(error))
						})
				}
			})
		})
	}

	async saveLarkMessage(message: ChatLarkMessage) {
		if (message.messageId) {
			await this.core.chat.upsertChatMessage({
				id: message.messageId,
				thirdPartyMessage: (message.toJSON() as SerializedConstructor).kwargs
			})
		}
	}

	private async resolveActiveConversationId(
		userId: string,
		xpertId: string,
		conversationId?: string
	): Promise<string | undefined> {
		if (!conversationId) {
			return undefined
		}

		const conversation = await this.core.chat.getChatConversation(conversationId)
		if (conversation) {
			return conversationId
		}

		this.logger.warn(
			`Lark cached conversation not found. user=${userId}, xpert=${xpertId}, conversation=${conversationId}`
		)
		await this.conversationService.clearConversation(userId, xpertId)
		return undefined
	}
}

function isRecordNotFoundError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false
	}
	return error.message.toLowerCase().includes('requested record was not found')
}
