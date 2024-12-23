import { AIMessageChunk, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableConfig } from '@langchain/core/runnables'
import { CompiledStateGraph, START } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	CopilotBaseMessage,
	CopilotChatMessage,
	CopilotMessageGroup,
	IChatConversation,
	ICopilot,
	IUser,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { AgentRecursionLimit } from '@metad/copilot'
import { getErrorMessage, shortuuid } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { formatDocumentsAsString } from 'langchain/util/document'
import { catchError, concat, filter, from, fromEvent, map, Observable, of, tap } from 'rxjs'
import { ChatConversationUpsertCommand } from '../chat-conversation'
import { CopilotGetChatQuery, createReactAgent } from '../copilot'
import { CopilotCheckpointSaver } from '../copilot-checkpoint'
import { CopilotModelGetChatModelQuery } from '../copilot-model'
import { CopilotNotFoundException } from '../core/errors'
import { KnowledgeSearchQuery } from '../knowledgebase/queries'
import { ChatAgentState, chatAgentState } from './types'

export class ChatConversationAgent {
	private logger = new Logger(ChatConversationAgent.name)
	public copilot: ICopilot = null
	public graph: CompiledStateGraph<ChatAgentState, Partial<ChatAgentState>, typeof START | 'agent' | 'tools'>
	get id() {
		return this.conversation.id
	}
	get tenantId() {
		return this.user.tenantId
	}

	private message: CopilotMessageGroup = null
	private abortController: AbortController = new AbortController()

	// knowledges
	private knowledges = null

	constructor(
		public conversation: IChatConversation,
		public readonly organizationId: string,
		private readonly user: IUser,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		// private readonly chatService: ChatService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		// this.copilot = this.chatService.findCopilot(this.tenantId, organizationId, AiProviderRole.Secondary)
	}

	// createLLM(copilot: ICopilot) {
	// 	return createLLM<BaseChatModel>(copilot, {}, async (input) => {
	// 		try {
	// 			await this.commandBus.execute(
	// 				new CopilotTokenRecordCommand({
	// 					...input,
	// 					tenantId: this.tenantId,
	// 					organizationId: this.organizationId,
	// 					userId: this.user.id,
	// 					copilotId: copilot.id
	// 				})
	// 			)
	// 		} catch(err) {
	// 			if (this.abortController && !this.abortController.signal.aborted) {
	// 				try {
	// 					this.abortController.abort(err.message)
	// 				} catch(err) {
	// 					//
	// 				}
	// 			}

	// 		}
	// 	})
	// }

	async createAgentGraph() {
		const tenantId = this.tenantId
		const organizationId = this.organizationId
		this.copilot = await this.queryBus.execute(new CopilotGetChatQuery(tenantId, organizationId, []))
		if (!this.copilot) {
			throw new CopilotNotFoundException(`Primary chat copilot not found`)
		}

		const llm = await this.queryBus.execute(
			new CopilotModelGetChatModelQuery(this.copilot, null, { abortController: this.abortController })
		)

		const tools = []
		this.graph = createReactAgent({
			state: chatAgentState,
			llm,
			checkpointSaver: this.copilotCheckpointSaver,
			// interruptBefore,
			// interruptAfter,
			tools: [...tools],
			messageModifier: async (state) => {
				const systemTemplate = `{{role}}
{{language}}
References documents:
{{context}}
`
				const system = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
					templateFormat: 'mustache'
				}).format({ ...state })
				return [new SystemMessage(system), ...state.messages]
			}
		})

		return this
	}

	streamGraphEvents(input: string, answerId: string) {
		const eventStack: string[] = []
		// let toolId = ''
		let stepMessage = null
		let prevEvent = ''
		let toolCalls = null
		return new Observable((subscriber) => {
			from(
				this.graph.streamEvents(
					{
						input,
						messages: [new HumanMessage(input)],
						context: this.knowledges
					},
					{
						version: 'v2',
						configurable: {
							thread_id: this.id,
							checkpoint_ns: '',
							tenantId: this.tenantId,
							organizationId: this.organizationId,
							userId: this.user.id,
							subscriber
						},
						recursionLimit: AgentRecursionLimit,
						signal: this.abortController.signal
						// debug: true
					}
				)
			)
				.pipe(
					map(({ event, data, ...rest }: any) => {
						if (Logger.isLevelEnabled('verbose')) {
							if (event === 'on_chat_model_stream') {
								if (prevEvent === 'on_chat_model_stream') {
									process.stdout.write('.')
								} else {
									this.logger.verbose('on_chat_model_stream')
								}
							} else {
								if (prevEvent === 'on_chat_model_stream') {
									process.stdout.write('\n')
								}
								this.logger.verbose(event)
							}
						}
						prevEvent = event
						switch (event) {
							case 'on_chain_start': {
								eventStack.push(event)
								break
							}
							case 'on_chat_model_start': {
								eventStack.push(event)
								this.message.content = ''
								break
							}
							case 'on_chain_end': {
								let _event = eventStack.pop()
								if (_event === 'on_tool_start') {
									// 当调用 Tool 报错异常时会跳过 on_tool_end 事件，直接到此事件
									while (_event === 'on_tool_start') {
										_event = eventStack.pop()
									}
									// Clear all error tool calls
									const toolMessages: CopilotMessageGroup[] = []
									if (toolCalls) {
										Object.keys(toolCalls)
											.filter((id) => !!toolCalls[id])
											.forEach((id) => {
												this.updateStep(id, { status: XpertAgentExecutionStatusEnum.ERROR })
												toolMessages.push({
													id,
													role: 'tool',
													status: XpertAgentExecutionStatusEnum.ERROR
												})
											})
										toolCalls = null
										if (toolMessages.length) {
											this.logger.debug(`Tool call error:`)
											this.logger.debug(data, rest)

											return {
												data: {
													type: ChatMessageTypeEnum.EVENT,
													event: ChatMessageEventTypeEnum.ON_TOOL_END,
													data: toolMessages
												}
											}
										}
									}
								}

								// All chains end
								if (_event !== 'on_chain_start') {
									eventStack.pop()
								}
								if (!eventStack.length) {
									return {
										data: {
											type: ChatMessageTypeEnum.EVENT,
											event: ChatMessageEventTypeEnum.ON_AGENT_END,
											data: {
												id: answerId
											}
										}
									}
								}
								break
							}
							case 'on_chat_model_end': {
								const _event = eventStack.pop()
								if (_event !== 'on_chat_model_start') {
									eventStack.pop()
								}
								return null
							}
							case 'on_chat_model_stream': {
								const msg = data.chunk as AIMessageChunk
								if (!msg.tool_call_chunks?.length) {
									if (msg.content) {
										this.message.content = <string>this.message.content + msg.content
										return {
											data: {
												type: ChatMessageTypeEnum.MESSAGE,
												data: msg.content
											}
										}
									}
								}
								break
							}
							case 'on_tool_start': {
								this.logger.debug(`Tool call '` + rest.name + "':")
								this.logger.debug(data, rest)
								eventStack.push(event)
								// toolId = rest.run_id,

								// Tools currently called in parallel
								toolCalls ??= {}
								toolCalls[rest.run_id] = data

								stepMessage = {
									id: rest.run_id,
									name: rest.name,
									role: 'tool',
									status: 'thinking',
									messages: [
										{
											id: shortuuid(),
											role: 'assistant',
											content: '```json\n' + data.input.input + '\n```'
										}
									]
								}
								this.addStep(stepMessage)
								return {
									data: {
										type: ChatMessageTypeEnum.EVENT,
										event: ChatMessageEventTypeEnum.ON_TOOL_START,
										data: stepMessage
									}
								}
							}
							case 'on_tool_end': {
								this.logger.debug(`Tool call end '` + rest.name + "':")
								// this.logger.debug(data)

								// Clear finished tool call
								toolCalls[rest.run_id] = null

								const _event = eventStack.pop()
								if (_event !== 'on_tool_start') {
									eventStack.pop()
								}
								if (stepMessage) {
									stepMessage.status = 'done'
								}

								const toolMessage = data.output as ToolMessage

								const message: CopilotBaseMessage = {
									id: shortuuid(),
									role: 'assistant',
									content: toolMessage.content
								}
								this.updateStep(rest.run_id, { status: XpertAgentExecutionStatusEnum.SUCCESS })
								this.addStepMessage(rest.run_id, message)

								return {
									data: {
										type: ChatMessageTypeEnum.EVENT,
										event: ChatMessageEventTypeEnum.ON_TOOL_END,
										data: {
											id: rest.run_id,
											name: rest.name,
											role: 'tool',
											status: 'done',
											messages: [message]
										}
									}
								}
							}
						}
						return null
					})
				)
				.subscribe(subscriber)
		}).pipe(
			filter((data) => data != null),
			tap({
				next: (event: MessageEvent) => {
					if (event?.data.type === ChatMessageTypeEnum.MESSAGE) {
						this.addStep(event.data)
					} else if (event?.data.type === ChatMessageTypeEnum.EVENT) {
						this.addStepMessage(event.data.id, event.data.message)
					}
				},
				complete: () => {
					this.upsertMessageWithStatus(XpertAgentExecutionStatusEnum.SUCCESS)
				}
			})
			// catchError((err) => {
			// 	// todo 区分 aborted 与 error
			// 	console.error(err)
			// 	return of({
			// 		event: ChatGatewayEvent.Error,
			// 		data: {
			// 			conversationId: this.conversation.id,
			// 			id: answerId,
			// 			error: getErrorMessage(err)
			// 		}
			// 	})
			// })
		)
	}

	knowledgeSearch(content: string, answerId: string) {
		return new Observable((subscriber) => {
			let completed = false
			if (!this.conversation.options?.knowledgebases?.length) {
				completed = true
				subscriber.complete()
			}

			const stepMessage: CopilotChatMessage = {
				id: 'documents',
				role: 'system',
				content: '',
				status: 'thinking'
			}
			// subscriber.next({
			// 	event: ChatGatewayEvent.StepStart,
			// 	data: stepMessage
			// })
			// Search knowledgebases
			this.queryBus
				.execute(
					new KnowledgeSearchQuery({
						tenantId: this.tenantId,
						organizationId: this.organizationId,
						k: 10,
						// score: 0.5,
						knowledgebases: this.conversation.options?.knowledgebases,
						query: content
					})
				)
				.then((items) => {
					if (!subscriber.closed) {
						const knowledges = formatDocumentsAsString(items.map(({ doc }) => doc))
						// this.updateState({ context })
						this.knowledges = knowledges
						completed = true

						stepMessage.status = XpertAgentExecutionStatusEnum.SUCCESS
						stepMessage.content = `Got ${items.length} document chunks!`
						stepMessage.data = items
						this.addStep({ ...stepMessage })
						// subscriber.next({
						// 	event: ChatGatewayEvent.StepEnd,
						// 	data: { ...stepMessage }
						// })
						subscriber.complete()
					}
				})
				.catch((error) => {
					this.addStep({ ...stepMessage, status: XpertAgentExecutionStatusEnum.ERROR, content: getErrorMessage(error) })
					// subscriber.next({
					// 	event: ChatGatewayEvent.StepEnd,
					// 	data: { ...stepMessage, status: 'error' }
					// })
					subscriber.error(error)
				})

			return () => {
				if (!completed) {
					this.addStep({ ...stepMessage, status: 'aborted' })
				}
			}
		})
	}

	chat(input: string, answerId: string) {
		if (this.abortController) {
			this.cancel()
		}
		this.abortController = new AbortController()
		const abortSignal$ = fromEvent(this.abortController.signal, 'abort')
		return concat(this.knowledgeSearch(input, answerId), this.streamGraphEvents(input, answerId)).pipe(
			(source) =>
				new Observable((subscriber) => {
					abortSignal$.subscribe(() => {
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_ERROR,
								data: {
									conversationId: this.conversation.id,
									id: answerId
								}
							}
						})
						subscriber.unsubscribe()
						this.upsertMessageWithStatus('aborted')
					})
					!subscriber.closed && source.subscribe(subscriber)
				}),
			catchError((err) => {
				this.upsertMessageWithStatus(XpertAgentExecutionStatusEnum.ERROR, getErrorMessage(err))
				return of({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_ERROR,
						data: {
							conversationId: this.conversation.id,
							id: answerId,
							role: 'error',
							error: getErrorMessage(err)
						}
					}
				})
			})
		)
	}

	updateState(state: Partial<ChatAgentState>) {
		this.graph.updateState(
			{
				configurable: {
					thread_id: this.id,
					checkpoint_ns: '',
					checkpoint_id: '',
					tenantId: this.tenantId,
					organizationId: this.organizationId
				}
			} as RunnableConfig,
			state
		)
	}

	newMessage(answerId: string) {
		this.message = { id: answerId, messages: [], role: 'assistant', content: '' } as CopilotMessageGroup
	}

	addStep(step: CopilotChatMessage) {
		this.message.messages.push(step)
	}

	updateStep(id: string, step: Partial<CopilotChatMessage>) {
		const index = this.message.messages.findIndex((message) => message.id === id)
		if (index > -1) {
			this.message.messages[index] = { ...this.message.messages[index], ...step }
		}
	}
	/**
	 * Add messages to tool call step message
	 *
	 * @param id
	 * @param message
	 */
	addStepMessage(id: string, message: CopilotBaseMessage) {
		const index = this.message.messages.findIndex((item) => item.id === id)
		if (index > -1) {
			const step = this.message.messages[index] as unknown as CopilotMessageGroup
			step.messages ??= []
			step.messages.push(message)
		}
	}

	async upsertMessageWithStatus(status: CopilotBaseMessage['status'], content?: string) {
		if (!content && !this.message.content && !this.message.messages?.length) {
			return
		}
		try {
			// Update status of message and it's sub messages
			const message = {
				...this.message,
				status,
				messages: this.message.messages.map((m) => (m.status === 'thinking' ? { ...m, status } : m))
			} as CopilotMessageGroup

			if (content) {
				message.content = content
			}

			// Record conversation message
			await this.saveMessage(message)

			this.logger.debug(`Conversation '${this.id}' has been finished`)
		} catch (err) {
			console.log('error', err)
		}
	}

	async saveMessage(message: CopilotBaseMessage) {
		// Record conversation message
		this.conversation = await this.commandBus.execute(
			new ChatConversationUpsertCommand({
				id: this.id,
				title: this.conversation.title,
				messages: [...(this.conversation.messages ?? []), message]
			})
		)
	}

	/**
	 * Cancel the currently existing Graph execution task
	 */
	cancel() {
		try {
			this.abortController?.abort(`Abort by user`)
		} catch (err) {
			//
		}

		this.abortController = null
	}
}
