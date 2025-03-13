import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, IChatConversation, IChatMessage, IXpertAgentExecution, TChatConversationStatus, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { AgentRecursionLimit, appendMessageContent, isNil, NgmLanguageEnum } from '@metad/copilot'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { catchError, concat, EMPTY, filter, from, map, Observable, of, switchMap, tap } from 'rxjs'
import { ChatConversationUpsertCommand } from '../../../chat-conversation'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { ChatCommonCommand } from '../chat-common.command'
import { CopilotGetChatQuery } from '../../../copilot'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { createReactAgent } from '../../../xpert-agent/commands/handlers/react_agent_executor'
import { AgentStateAnnotation } from '../../../xpert-agent/commands/handlers/types'
import { getErrorMessage } from '@metad/server-common'
import { CompiledStateGraph, NodeInterrupt } from '@langchain/langgraph'
import { ChatMessageUpsertCommand } from '../../../chat-message'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { HumanMessage, isToolMessage, MessageContent } from '@langchain/core/messages'
import { RequestContext } from '@metad/server-core'
import { createMapStreamEvents } from '../../../xpert-agent'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { EnsembleRetriever } from 'langchain/retrievers/ensemble'
import z from 'zod'

@CommandHandler(ChatCommonCommand)
export class ChatCommonHandler implements ICommandHandler<ChatCommonCommand> {
	readonly #logger = new Logger(ChatCommonHandler.name)

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ChatCommonCommand): Promise<Observable<any>> {
		const { tenantId, organizationId, user, knowledgebases } = command.options
		const { conversationId, input, retry } = command.request
		const userId = RequestContext.currentUserId()

		let conversation: IChatConversation = null
		let userMessage: IChatMessage = null
		let aiMessage: IChatMessage = null
		if (isNil(conversationId)) {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					tenantId,
					organizationId,
					createdById: user.id,
					status: 'busy',
					options: {
						knowledgebases
					}
				})
			)
		} else {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					id: conversationId,
					status: 'busy',
					error: null
				}, ['messages'])
			)
			const lastMessage = conversation.messages[conversation.messages.length - 1]
			if (retry) {
				if (lastMessage?.role === 'ai') {
					aiMessage = lastMessage
				} else if (lastMessage?.role === 'human') {
					userMessage = lastMessage
				}
			}
		}

		// New execution (Run) in thread
		const execution = await this.commandBus.execute<XpertAgentExecutionUpsertCommand, IXpertAgentExecution>(
			new XpertAgentExecutionUpsertCommand({
				inputs: input,
				status: XpertAgentExecutionStatusEnum.RUNNING,
				threadId: conversation.threadId
			})
		)

		if (!userMessage) {
			userMessage = await this.commandBus.execute(
				new ChatMessageUpsertCommand({
					role: 'human',
					content: input.input,
					conversationId: conversation.id
				})
			)
		}

		const tools = []
		// Knowledgebases
		if (knowledgebases?.length) {
			const retrievers = knowledgebases.map((id) => createKnowledgeRetriever(this.queryBus, id))
			const retriever = new EnsembleRetriever({
				retrievers: retrievers,
				weights: retrievers.map(() => 0.5),
			  })
			tools.push(retriever.asTool({
				name: "knowledge_retriever",
				description: "Get information about question.",
				schema: z.string(),
			  }))
		}

		const executionId = execution.id
		let status = XpertAgentExecutionStatusEnum.SUCCESS
		return new Observable<MessageEvent>((subscriber) => {
			;(async () => {
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
						data: {
							id: conversation.id,
							status: 'busy',
							createdAt: conversation.createdAt,
							updatedAt: conversation.updatedAt
						}
					}
				} as MessageEvent)

				let graph: any = null

				try {
					// Find an available copilot
					const copilot = await this.queryBus.execute(new CopilotGetChatQuery(tenantId, organizationId))

					const abortController = new AbortController()
					const chatModel = await this.queryBus.execute(
						new CopilotModelGetChatModelQuery(copilot, null, {
							abortController,
							usageCallback: assignExecutionUsage(execution),
						})
					)

					const thread_id = execution.threadId
					graph = createReactAgent({
						tags: [thread_id],
						llm: chatModel,
						checkpointSaver: this.copilotCheckpointSaver,
						tools,
						stateModifier: async (state: typeof AgentStateAnnotation.State) => {
							const systemTemplate = `Current time: ${new Date().toISOString()}\n`
							const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
								templateFormat: 'mustache'
							}).format({ ...state })
							return [systemMessage, ...state.messages]
						},
					})

					// Run
					const config = {
						thread_id,
						checkpoint_ns: '',
					}

					const contentStream = from(
						graph.streamEvents(
							(input?.input || retry) ? {
								...(input ?? {}),
								messages: [new HumanMessage(userMessage.content as string)]
							} : null,
							{
								version: 'v2',
								configurable: {
									...config,
									tenantId: tenantId,
									organizationId: organizationId,
									userId,
									subscriber
								},
								recursionLimit: AgentRecursionLimit,
								signal: abortController.signal
							},
						)
					).pipe(
						map(createMapStreamEvents(this.#logger, thread_id, subscriber,))
					)

					const timeStart = Date.now()
					let result = ''
					let error = null
					concat(contentStream, of(true).pipe(
						switchMap(async () => {
							const state = await graph.getState({
								configurable: {
									...config,
								}
							})

							execution.checkpointId = state.parentConfig?.configurable?.checkpoint_id

							// Update execution title from graph states
							if (state.values.title) {
								execution.title = state.values.title
							}

							const messages = state.values.messages
							const lastMessage = messages[messages.length - 1]

							if (isToolMessage(lastMessage)) {
								return lastMessage.content
							}
						})
					))
					.pipe(
						filter((content) => !isNil(content)),
						map((messageContent: MessageContent) => {
							result += messageContent
							return {
								data: {
									type: ChatMessageTypeEnum.MESSAGE,
									data: messageContent
								}
							} as MessageEvent
						}),
						catchError((err) => {
							if (err instanceof NodeInterrupt) {
								status = XpertAgentExecutionStatusEnum.INTERRUPTED
								error = null
							} else {
								status = XpertAgentExecutionStatusEnum.ERROR
								error = getErrorMessage(err)
							}
							return EMPTY
						})
					)
					.subscribe({
						next: (message) => {
							subscriber.next(message)
						},
						complete: async () => {
							try {
								const timeEnd = Date.now()
	
								// Record End time
								await this.commandBus.execute(
									new XpertAgentExecutionUpsertCommand({
										...execution,
										elapsedTime: Number(execution.elapsedTime ?? 0) + (timeEnd - timeStart),
										status,
										error,
										outputs: {
											output: result
										},
									})
								)

								let convStatus: TChatConversationStatus = 'idle'
								if (status === XpertAgentExecutionStatusEnum.ERROR) {
									convStatus = 'error'
								} else if (status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
									convStatus = 'interrupted'
								}
								const _conversation = await this.commandBus.execute(
									new ChatConversationUpsertCommand({
										id: conversation.id,
										status: convStatus,
										title: conversation.title || execution.title,
										error
									})
								)
	
								subscriber.next({
									data: {
										type: ChatMessageTypeEnum.EVENT,
										event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
										data: {
											id: _conversation.id,
											title: _conversation.title,
											status: _conversation.status,
											operation: _conversation.operation,
											error: _conversation.error
										}
									}
								} as MessageEvent)
								subscriber.complete()
							} catch (err) {
								this.#logger.warn(err)
								subscriber.error(err)
							}
						}
					})

					if (!aiMessage) {
						aiMessage = await this.commandBus.execute(
							new ChatMessageUpsertCommand({
								role: 'ai',
								content: ``,
								executionId,
								conversationId: conversation.id,
								status: 'thinking'
							})
						)
					}

					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.EVENT,
							event: ChatMessageEventTypeEnum.ON_MESSAGE_START,
							data: { ...aiMessage, status: 'thinking' }
						}
					} as MessageEvent)
					
				} catch(err) {
					const entity = {
						id: conversation.id,
						status: 'error',
						error: getErrorMessage(err)
					} as Partial<IChatConversation>
					await this.commandBus.execute(new ChatConversationUpsertCommand(entity))
					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.EVENT,
							event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
							data: entity
						}
					} as MessageEvent)
					subscriber.complete()
				}
			})()
		}).pipe(
			tap({
				next: (event) => {
					if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
						if (aiMessage) {
							appendMessageContent(aiMessage as any, event.data.data)
						}
					}
				},
				finalize: async () => {
					if (aiMessage) {
						try {
							// Update ai message
							aiMessage.status = status
							await this.commandBus.execute(new ChatMessageUpsertCommand(aiMessage))
						} catch(err) {
							this.#logger.error(err)
						}
					}
				}
			})
		)
	}

	private languagePrompt(language: string) {
		return `Please answer in language ${Object.entries(NgmLanguageEnum).find((item) => item[1] === language)?.[0] ?? 'English'}`
	}
}
