// import {
// 	ChatGatewayEvent,
// 	ChatGatewayMessage,
// 	ChatUserMessage,
// 	IChatConversation,
// 	IXpert,
// 	IXpertToolset,
// } from '@metad/contracts'
// import { NgmLanguageEnum } from '@metad/copilot'
// import { getErrorMessage, shortuuid } from '@metad/server-common'
// import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
// import { isNil } from 'lodash'
// import { Observable } from 'rxjs'
// import { ChatConversationCreateCommand, FindChatConversationQuery } from '../../../chat-conversation'
// import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
// import { CopilotCheckLimitCommand } from '../../../copilot-user'
// import { ChatConversationAgent } from '../../chat-conversation'
// import { ChatService } from '../../chat.service'
// import { ChatWSCommand } from '../chat-ws.command'
// import { FindXpertToolsetsQuery } from '../../../xpert-toolset/index'
// import { FindXpertQuery } from '../../../xpert'


// @CommandHandler(ChatWSCommand)
// export class ChatWSCommandHandler implements ICommandHandler<ChatWSCommand> {
// 	constructor(
// 		private readonly chatService: ChatService,
// 		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
// 		private readonly commandBus: CommandBus,
// 		private readonly queryBus: QueryBus
// 	) {}

// 	public async execute(command: ChatWSCommand): Promise<Observable<any>> {
// 		const { tenantId, organizationId, user, xpert, data } = command.input
// 		const { conversationId, id, language, content } = data as ChatUserMessage

// 		return new Observable<ChatGatewayMessage>((subscriber) => {
// 			(async () => {
// 				let chatConversation: IChatConversation = null
// 				if (isNil(conversationId)) {
// 					chatConversation = await this.commandBus.execute(
// 						new ChatConversationCreateCommand({
// 							entity: {
// 								tenantId,
// 								organizationId,
// 								createdById: user.id,
// 								xpertId: xpert?.id,
// 								title: content, // 改成 AI 自动总结标题
// 								options: {
// 									knowledgebases: xpert?.knowledgebases,
// 									toolsets: xpert?.toolsets
// 								}
// 							}
// 						})
// 					)

// 					subscriber.next({
// 						event: ChatGatewayEvent.ConversationCreated,
// 						data: chatConversation
// 					})
// 				} else {
// 					chatConversation = await this.queryBus.execute(
// 						new FindChatConversationQuery({
// 							id: conversationId
// 						})
// 					)
// 				}

// 				let _xpert: IXpert = null
// 				if (xpert?.id) {
// 					_xpert = await this.queryBus.execute<FindXpertQuery, IXpert>(
// 						new FindXpertQuery({ tenantId, organizationId, id: xpert.id }, ['agent'])
// 					)
// 				}

// 				if (!this.chatService.getConversation(chatConversation.id)) {
// 					await this.chatService.fetchCopilots(tenantId, organizationId)
// 					const toolsets = await this.queryBus.execute<FindXpertToolsetsQuery, IXpertToolset[]>(new FindXpertToolsetsQuery(xpert?.toolsets ?? []))

// 					try {
// 						this.chatService.setConversation(
// 							chatConversation.id,
// 							new ChatConversationAgent(
// 								chatConversation,
// 								organizationId,
// 								user,
// 								this.copilotCheckpointSaver,
// 								this.chatService,
// 								this.commandBus,
// 								this.queryBus
// 							).createAgentGraph(null)
// 						)
// 					} catch (error) {
// 						subscriber.next({
// 							event: ChatGatewayEvent.Error,
// 							data: {
// 								id: shortuuid(),
// 								role: 'info',
// 								error: getErrorMessage(error),
// 							}
// 						})
// 						subscriber.complete()
// 						return
// 					}
// 				}
// 				const conversation = this.chatService.getConversation(chatConversation.id)

// 				if (language) {
// 					conversation.updateState({ language: this.languagePrompt(language) })
// 				}
// 				if (_xpert) {
// 					conversation.updateState({ role: _xpert.agent.prompt })
// 				}

// 				const answerId = shortuuid()
// 				// Response start event
// 				subscriber.next({
// 					event: ChatGatewayEvent.ChainStart,
// 					data: {
// 						id: answerId
// 					}
// 				})

// 				conversation.newMessage(answerId)
// 				// Update conversation messages
// 				await conversation.saveMessage({ id, content, role: 'user' })

// 				// Check token limit
// 				try {
// 					await this.commandBus.execute(new CopilotCheckLimitCommand({
// 						tenantId,
// 						organizationId,
// 						userId: user.id,
// 						copilot: conversation.copilot
// 					}))
// 				} catch(err) {
// 					await conversation.saveMessage({ id, content: err.message, role: 'assistant' })
// 					subscriber.next({
// 						event: ChatGatewayEvent.Error,
// 						data: {
// 							id: answerId,
// 							role: 'info',
// 							error: err.message,
// 						}
// 					})
// 					subscriber.complete()
// 					return
// 				}

// 				conversation
// 					.chat(content, answerId)
// 					.subscribe(subscriber)
// 			})()
// 		})
// 	}

// 	private languagePrompt(language: string) {
// 		return `Please answer in language ${Object.entries(NgmLanguageEnum).find((item) => item[1] === language)?.[0] ?? 'English'}`
// 	}
// }
