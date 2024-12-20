import { MessageContent } from '@langchain/core/messages'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, CopilotChatMessage, figureOutXpert, IChatConversation, IXpert, LongTermMemoryTypeEnum, TChatConversationStatus, TSensitiveOperation, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { catchError, concat, EMPTY, Observable, of, switchMap, tap } from 'rxjs'
import { XpertAgentChatCommand } from '../../../xpert-agent/'
import { XpertService } from '../../xpert.service'
import { XpertChatCommand } from '../chat.command'
import { GetChatConversationQuery, CancelSummaryJobCommand, ChatConversationUpsertCommand, ScheduleSummaryJobCommand } from '../../../chat-conversation/'
import {
	XpertAgentExecutionUpsertCommand
} from '../../../xpert-agent-execution/commands'
import { ChatMessageUpsertCommand } from '../../../chat-message'
import { GetXpertMemoryEmbeddingsQuery } from '../../queries'
import { CreateCopilotStoreCommand } from '../../../copilot-store'
import { BaseStore } from '@langchain/langgraph'

@CommandHandler(XpertChatCommand)
export class XpertChatHandler implements ICommandHandler<XpertChatCommand> {
	readonly #logger = new Logger(XpertChatHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertChatCommand): Promise<Observable<MessageEvent>> {
		const { options } = command
		const { xpertId, input, conversationId, confirm, reject, toolCalls } = command.request
		const userId = RequestContext.currentUserId()

		const timeStart = Date.now()

		const xpert = await this.xpertService.findOne(xpertId, { relations: ['agent'] })
		const latestXpert = figureOutXpert(xpert, options.isDraft)
		const memory = latestXpert.memory
		const memoryStore = await this.createMemoryStore(
			latestXpert,
			userId
		)
		let memories = []
		

		let conversation: IChatConversation
		let aiMessage: CopilotChatMessage
		let executionId: string
		// Continue thread when confirm or reject operation
		if (confirm || reject) {
			conversation = await this.queryBus.execute(
				new GetChatConversationQuery({ id: conversationId }, ['messages'])
			)
			aiMessage = conversation.messages[conversation.messages.length - 1] as CopilotChatMessage
			executionId = aiMessage.executionId

			// Cancel summary job
			if (memory?.enabled && memory.profile?.enabled) {
				await this.commandBus.execute(new CancelSummaryJobCommand(conversation.id))
			}
		} else {
			// New message in conversation
			if (conversationId) {
				conversation = await this.queryBus.execute(
					new GetChatConversationQuery({id: conversationId}, ['messages'])
				)
				// Cancel summary job
				if (memory?.enabled && memory.profile?.enabled) {
					await this.commandBus.execute(new CancelSummaryJobCommand(conversation.id))
				}
			} else {
				// New conversation
				conversation = await this.commandBus.execute(
					new ChatConversationUpsertCommand({
						xpert,
						title: input.input, // 改成 AI 自动总结标题
						options: {
							knowledgebases: options?.knowledgebases,
							toolsets: options?.toolsets
						},
					})
				)

				// Remember
				memories = await this.getLongTermMemory(memoryStore, xpertId, input.input)
			}

			// New execution (Run) in thread
			const execution = await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					xpert: { id: xpert.id } as IXpert,
					agentKey: xpert.agent.key,
					inputs: input,
					status: XpertAgentExecutionStatusEnum.RUNNING,
					threadId: conversation.threadId
				})
			)
			executionId = execution.id

			const userMessage = await this.commandBus.execute(new ChatMessageUpsertCommand({
				role: 'human',
				content: input.input,
				conversationId: conversation.id
			}))
			aiMessage = await this.commandBus.execute(new ChatMessageUpsertCommand({
				role: 'ai',
				content: ``,
				executionId,
				conversationId: conversation.id,
				status: 'thinking'
			}))
		}

		let status = XpertAgentExecutionStatusEnum.SUCCESS
		let error = null
		let result = ''

		const agentObservable = await this.commandBus.execute<XpertAgentChatCommand, Promise<Observable<MessageEvent>>>(
			new XpertAgentChatCommand(input, xpert.agent.key, xpert, {
				...(options ?? {}),
				isDraft: options?.isDraft,
				execution: { id: executionId },
				toolCalls,
				reject,
				memories
			})
		)

		return new Observable<MessageEvent>((subscriber) => {
			// New conversation
			subscriber.next({
				data: {
					type: ChatMessageTypeEnum.EVENT,
					event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
					data: {
						id: conversation.id,
						title: conversation.title,
						createdAt: conversation.createdAt,
						updatedAt: conversation.updatedAt,
					}
				}
			} as MessageEvent)

			subscriber.next({
				data: {
					type: ChatMessageTypeEnum.EVENT,
					event: ChatMessageEventTypeEnum.ON_MESSAGE_START,
					data: {...aiMessage, status: 'thinking'}
				}
			} as MessageEvent)

			let _execution = null
			let operation: TSensitiveOperation = null
			concat(agentObservable.pipe(
				tap({
					next: (event) => {
						if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
							appendMessageContent(aiMessage, event.data.data)
							if (typeof event.data.data === 'string') {
							  result += event.data.data
							}
						} else if (event.data.type === ChatMessageTypeEnum.EVENT && event.data.event === ChatMessageEventTypeEnum.ON_AGENT_END) {
							_execution = event.data.data
						} else if (event.data.type === ChatMessageTypeEnum.EVENT && event.data.event === ChatMessageEventTypeEnum.ON_INTERRUPT) {
							operation = event.data.data
						}
					},
				}),
				catchError((err) => {
					status = XpertAgentExecutionStatusEnum.ERROR
					error = getErrorMessage(err)
					return EMPTY
				}),
			), of(true).pipe(
				switchMap(async () => {
					try {
						// Record Execution
						const timeEnd = Date.now()
						const entity = status === XpertAgentExecutionStatusEnum.ERROR ? {
							id: executionId,
							elapsedTime: timeEnd - timeStart,
							status,
							error,
							outputs: {
								output: result
							}
						} : {
							id: executionId,
							elapsedTime: timeEnd - timeStart,
							outputs: {
								output: result
							}
						}
						await this.commandBus.execute(new XpertAgentExecutionUpsertCommand(entity))
						
						// Update ai message
						aiMessage.status = _execution.status
						await this.commandBus.execute(new ChatMessageUpsertCommand(aiMessage))

						// Update conversation
						let convStatus: TChatConversationStatus = 'idle'
						if (_execution.status === XpertAgentExecutionStatusEnum.ERROR) {
							convStatus = 'error'
						} else if (_execution.status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
							convStatus = 'interrupted'
						}
						const _conversation = await this.commandBus.execute(
							new ChatConversationUpsertCommand({
								id: conversation.id,
								status: convStatus,
								title: _execution.title,
								operation
							})
						)
						
						// Schedule summary job
						if (memory?.enabled && memory.profile?.enabled) {
							await this.commandBus.execute(new ScheduleSummaryJobCommand(conversation.id, userId, memory))
						}

						return {
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
								data: {
									id: _conversation.id,
									title: _conversation.title,
									status: _conversation.status,
									operation: _conversation.operation
								}
							}
						} as MessageEvent
					} catch (err) {
						console.log(err)
					}
				})
			)).subscribe(subscriber)

			return () => {
				//
			}
		})
	}

	async createMemoryStore(xpert: Partial<IXpert>, userId: string) {
		const { tenantId, organizationId } = xpert
		const memory = xpert.memory
		if (!memory?.enabled) {
			return null
		}

		const embeddings = await this.queryBus.execute(
			new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {})
		)

		const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
			new CreateCopilotStoreCommand({
				tenantId,
				organizationId,
				userId,
				index: {
					dims: null,
					embeddings,
					// fields
				}
			})
		)

		return store
	}

	async getLongTermMemory(store: BaseStore, xpertId: string, input: string) {
		return await store.search([xpertId, LongTermMemoryTypeEnum.PROFILE], { query: input })
	}

}

export function appendMessageContent(aiMessage: CopilotChatMessage, content: MessageContent) {
	const _content = aiMessage.content
	if (typeof content === 'string') {
		if (typeof _content === 'string') {
			aiMessage.content = _content + content
		} else if (Array.isArray(_content)) {
			const lastContent = _content[_content.length - 1]
			if (lastContent.type === 'text') {
				lastContent.text = lastContent.text + content
			} else {
				_content.push({
					type: 'text',
					text: content
				})
			}
		} else {
			aiMessage.content = content
		}
	} else {
		if (Array.isArray(_content)) {
			_content.push(content)
		} else if(_content) {
			aiMessage.content = [
				{
					type: 'text',
					text: _content
				},
				content
			]
		} else {
			aiMessage.content = [
				content
			]
		}
	}
}