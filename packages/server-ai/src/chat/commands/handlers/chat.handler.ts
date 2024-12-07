import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, IChatConversation } from '@metad/contracts'
import { isNil, NgmLanguageEnum } from '@metad/copilot'
import { getErrorMessage, shortuuid } from '@metad/server-common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import { ChatConversationUpsertCommand, GetChatConversationQuery } from '../../../chat-conversation'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { CopilotCheckLimitCommand } from '../../../copilot-user'
import { XpertChatCommand } from '../../../xpert'
import { ChatConversationAgent } from '../../chat-conversation'
import { ChatService } from '../../chat.service'
import { ChatCommand } from '../chat.command'

@CommandHandler(ChatCommand)
export class ChatCommandHandler implements ICommandHandler<ChatCommand> {
	constructor(
		private readonly chatService: ChatService,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ChatCommand): Promise<Observable<any>> {
		if (command.request.xpertId) {
			return await this.commandBus.execute(new XpertChatCommand(command.request, command.options))
		}

		const { tenantId, organizationId, user, knowledgebases, toolsets } = command.options
		const { conversationId, id, input, language } = command.request
		return new Observable<MessageEvent>((subscriber) => {
			;(async () => {
				let chatConversation: IChatConversation = null
				if (isNil(conversationId)) {
					chatConversation = await this.commandBus.execute(
						new ChatConversationUpsertCommand({
							tenantId,
							organizationId,
							createdById: user.id,
							title: input.input, // 改成 AI 自动总结标题
							options: {
								knowledgebases
							}
						})
					)

					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.EVENT,
							event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
							data: chatConversation
						}
					} as MessageEvent)
				} else {
					chatConversation = await this.queryBus.execute(
						new GetChatConversationQuery({
							id: conversationId
						})
					)
				}

				if (!this.chatService.getConversation(chatConversation.id)) {
					// await this.chatService.fetchCopilots(tenantId, organizationId)

					try {
						const conversation = new ChatConversationAgent(
							chatConversation,
							organizationId,
							user,
							this.copilotCheckpointSaver,
							// this.chatService,
							this.commandBus,
							this.queryBus
						)

						await conversation.createAgentGraph()

						this.chatService.setConversation(
							chatConversation.id,
							conversation
						)
					} catch (error) {
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_ERROR,
								data: {
									id: shortuuid(),
									role: 'info',
									error: getErrorMessage(error)
								}
							}
						} as MessageEvent)
						subscriber.complete()
						return
					}
				}
				const conversation = this.chatService.getConversation(chatConversation.id)

				if (language) {
					conversation.updateState({ language: this.languagePrompt(language) })
				}

				const answerId = shortuuid()
				// // Response start event
				// subscriber.next({
				// 	event: ChatGatewayEvent.ChainStart,
				// 	data: {
				// 		id: answerId
				// 	}
				// })

				conversation.newMessage(answerId)
				// Update conversation messages
				await conversation.saveMessage({ id, content: input.input, role: 'user' })

				// Check token limit
				try {
					await this.commandBus.execute(
						new CopilotCheckLimitCommand({
							tenantId,
							organizationId,
							userId: user.id,
							copilot: conversation.copilot
						})
					)
				} catch (err) {
					await conversation.saveMessage({ id, content: err.message, role: 'assistant' })
					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.EVENT,
							event: ChatMessageEventTypeEnum.ON_ERROR,
							data: {
								id: answerId,
								role: 'info',
								error: err.message
							}
						}
					} as MessageEvent)
					subscriber.complete()
					return
				}

				conversation.chat(input.input, answerId).subscribe(subscriber)
			})()
		})
	}

	private languagePrompt(language: string) {
		return `Please answer in language ${Object.entries(NgmLanguageEnum).find((item) => item[1] === language)?.[0] ?? 'English'}`
	}
}
