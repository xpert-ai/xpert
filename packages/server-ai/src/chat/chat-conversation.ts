import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { CompiledStateGraph, START } from '@langchain/langgraph'
import {
	AiProviderRole,
	ChatGatewayEvent,
	ChatGatewayMessage,
	CopilotBaseMessage,
	CopilotChatMessage,
	CopilotMessageGroup,
	IChatConversation,
	ICopilot,
	IXpertToolset,
	IUser,
	IXpert,
} from '@metad/contracts'
import { AgentRecursionLimit } from '@metad/copilot'
import { getErrorMessage, omit, shortuuid } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { formatDocumentsAsString } from 'langchain/util/document'
import { catchError, concat, filter, from, fromEvent, map, Observable, of, tap } from 'rxjs'
import { ChatConversationUpdateCommand } from '../chat-conversation'
import { createLLM, createReactAgent } from '../copilot'
import { CopilotCheckpointSaver } from '../copilot-checkpoint'
import { CopilotTokenRecordCommand } from '../copilot-user/commands'
import { KnowledgeSearchQuery } from '../knowledgebase/queries'
import { ChatService } from './chat.service'
import { ChatAgentState, chatAgentState } from './types'
import { RunnableConfig } from '@langchain/core/runnables'


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
	private abortController: AbortController

	// knowledges
	private knowledges = null

	constructor(
		public conversation: IChatConversation,
		public readonly organizationId: string,
		private readonly user: IUser,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly chatService: ChatService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		this.copilot = this.chatService.findCopilot(this.tenantId, organizationId, AiProviderRole.Secondary)
	}

	createLLM(copilot: ICopilot) {
		return createLLM<BaseChatModel>(copilot, {}, async (input) => {
			try {
				await this.commandBus.execute(
					new CopilotTokenRecordCommand({
						...input,
						tenantId: this.tenantId,
						organizationId: this.organizationId,
						userId: this.user.id,
						copilotId: copilot.id
					})
				)
			} catch(err) {
				if (this.abortController && !this.abortController.signal.aborted) {
					try {
						this.abortController.abort(err.message)
					} catch(err) {
						//
					}
				}
				
			}
		})
	}

	createAgentGraph(role: IXpert, toolsets: IXpertToolset[]) {
		const llm = this.createLLM(this.copilot)
		if (!llm) {
			throw new Error(`Can't create chatModel for provider '${this.copilot.provider}'`)
		}

		const tools = []

		// toolsets.forEach((toolset) => {
		// 	const toolkit = createToolset(toolset, {
		// 		tenantId: this.tenantId,
		// 		organizationId: this.organizationId,
		// 		toolsetService: this.chatService.toolsetService,
		// 		commandBus: this.commandBus,
		// 		user: this.user,
		// 		copilots: this.chatService.getCopilots(this.tenantId, this.organizationId),
		// 		chatModel: llm
		// 	})
		// 	if (toolkit) {
		// 		tools.push(...toolkit.getTools())
		// 	} else {
		// 		switch (toolset.name) {
		// 			case 'Wikipedia': {
		// 				const wikiTool = new WikipediaQueryRun({
		// 					topKResults: 3,
		// 					maxDocContentLength: 4000
		// 				})
		// 				tools.push(wikiTool)
		// 				break
		// 			}
		// 			// case 'DuckDuckGo': {
		// 			// 	const duckTool = new DuckDuckGoSearch({ maxResults: 1 })
		// 			// 	tools.push(duckTool)
		// 			// 	break
		// 			// }
		// 			case 'SearchApi': {
		// 				tools.push(new SearchApi(process.env.SEARCHAPI_API_KEY, {
		// 					...(toolset.tools?.[0]?.options ?? {}),
		// 				}))
		// 				break
		// 			}
		// 			// case 'TavilySearch': {
		// 			// 	tools.push(new TavilySearchResults({
		// 			// 		...(toolset.tools?.[0]?.options ?? {}),
		// 			// 		apiKey: process.env.TAVILY_API_KEY
		// 			// 	}))
		// 			// 	break
		// 			// }
		// 			case 'ExaSearch': {
		// 				tools.push(new ExaSearchResults({
		// 					client: exaClient,
		// 					searchArgs: {
		// 					...(toolset.tools?.[0]?.options ?? {}),
		// 					} as any,
		// 				})
		// 				)
		// 				break
		// 			}
		// 			case 'SearxngSearch': {
		// 				tools.push(new SearxngSearch({
		// 					apiBase: (toolset.tools?.[0]?.options ?? {}).apiBase,
		// 					params: {
		// 						engines: "google",
		// 						...omit(toolset.tools?.[0]?.options ?? {}, 'apiBase'),
		// 						format: "json", // Do not change this, format other than "json" is will throw error
		// 					},
		// 					// Custom Headers to support rapidAPI authentication Or any instance that requires custom headers
		// 					headers: {},
		// 				})
		// 				)
		// 				break
		// 			}

		// 			default: {
		// 				// toolset.tools?.forEach((item) => {
		// 				// 	switch (item.type) {
		// 				// 		case 'command': {
		// 				// 			let zodSchema: z.AnyZodObject = null
		// 				// 			try {
		// 				// 				zodSchema = eval(jsonSchemaToZod(JSON.parse(item.schema), { module: 'cjs' }))
		// 				// 			} catch (err) {
		// 				// 				throw new Error(`Invalid input schema for tool: ${item.name}`)
		// 				// 			}
		// 				// 			// Copilot
		// 				// 			let chatModel = llm
		// 				// 			if (item.providerRole || toolset.providerRole) {
		// 				// 				const copilot = this.chatService.findCopilot(this.tenantId, this.organizationId, item.providerRole || toolset.providerRole)
		// 				// 				chatModel = this.createLLM(copilot)
		// 				// 			}

		// 				// 			// Default args values in copilot role for tool function
		// 				// 			const defaultArgs = role?.options?.toolsets?.[toolset.id]?.[item.name]?.defaultArgs

		// 				// 			tools.push(
		// 				// 				tool(
		// 				// 					async (args, config) => {
		// 				// 						try {
		// 				// 							return await this.chatService.executeCommand(item.name, {
		// 				// 									...(defaultArgs ?? {}),
		// 				// 									...args
		// 				// 								}, config, <XpertToolContext>{
		// 				// 									tenantId: this.tenantId,
		// 				// 									organizationId: this.organizationId,
		// 				// 									user: this.user,
		// 				// 									chatModel,
		// 				// 									role,
		// 				// 									roleContext: role?.options?.context,
		// 				// 								})
		// 				// 						} catch(error) {
		// 				// 							return `Error: ${getErrorMessage(error)}`
		// 				// 						}
		// 				// 					},
		// 				// 					{
		// 				// 						name: item.name,
		// 				// 						description: item.description,
		// 				// 						schema: defaultArgs ? null : zodSchema
		// 				// 					}
		// 				// 				)
		// 				// 			)
		// 				// 			break
		// 				// 		}
		// 				// 	}
		// 				// })
		// 			}
		// 		}
		// 	}
		// })

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
			).pipe(
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
								while(_event === 'on_tool_start') {
									_event = eventStack.pop()
								}
								// Clear all error tool calls
								const toolMessages: CopilotMessageGroup[] = []
								if (toolCalls) {
									Object.keys(toolCalls).filter((id) => !!toolCalls[id]).forEach((id) => {
										this.updateStep(id, {status: 'error'})
										toolMessages.push({
											id,
											role: 'tool',
											status: 'error'
										})
									})
									toolCalls = null
									if (toolMessages.length) {
										this.logger.debug(`Tool call error:`)
										this.logger.debug(data, rest)

										return {
											event: ChatGatewayEvent.ToolEnd,
											data: toolMessages
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
									event: ChatGatewayEvent.ChainEnd,
									data: {
										id: answerId
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
									this.message.content = (<string>this.message.content) + msg.content
									return {
										event: ChatGatewayEvent.MessageStream,
										data: {
											conversationId: this.id,
											id: answerId,
											content: msg.content
										}
									}
								}
							}
							break
						}
						case 'on_tool_start': {
							this.logger.debug(`Tool call '` + rest.name + '\':')
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
								event: ChatGatewayEvent.ToolStart,
								data: stepMessage
							}
						}
						case 'on_tool_end': {
							this.logger.debug(`Tool call end '` + rest.name + '\':')
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
							this.updateStep(rest.run_id, { status: 'done' })
							this.addStepMessage(rest.run_id, message)

							return {
								event: ChatGatewayEvent.ToolEnd,
								data: {
									id: rest.run_id,
									name: rest.name,
									role: 'tool',
									status: 'done',
									messages: [
										message
									]
								}
							} as ChatGatewayMessage
						}
					}
					return null
				}),
			).subscribe(subscriber)
		}).pipe(
			filter((data) => data != null),
			tap({
				next: (event: ChatGatewayMessage) => {
					if (event?.event === ChatGatewayEvent.Message) {
						this.addStep(event.data)
					} else if(event?.event === ChatGatewayEvent.Agent) {
						this.addStepMessage(event.data.id, event.data.message)
					}
				},
				complete: () => {
					this.upsertMessageWithStatus('done')
				}
			}),
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
			subscriber.next({
				event: ChatGatewayEvent.StepStart,
				data: stepMessage
			})
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

						stepMessage.status = 'done'
						stepMessage.content = `Got ${items.length} document chunks!`
						stepMessage.data = items
						this.addStep({ ...stepMessage })
						subscriber.next({
							event: ChatGatewayEvent.StepEnd,
							data: { ...stepMessage }
						})
						subscriber.complete()
					}
				}).catch((error) => {
					this.addStep({ ...stepMessage, status: 'error', content: getErrorMessage(error) })
					subscriber.next({
						event: ChatGatewayEvent.StepEnd,
						data: { ...stepMessage, status: 'error' }
					})
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
							event: ChatGatewayEvent.ChainAborted,
							data: {
								conversationId: this.conversation.id,
								id: answerId
							}
						})
						subscriber.unsubscribe()
						this.upsertMessageWithStatus('aborted')
					})
					!subscriber.closed && source.subscribe(subscriber)
				}),
			catchError((err) => {
				this.upsertMessageWithStatus('error', getErrorMessage(err))
				return of({
					event: ChatGatewayEvent.Error,
					data: {
						conversationId: this.conversation.id,
						id: answerId,
						role: 'error',
						error: getErrorMessage(err)
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
					organizationId: this.organizationId,
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
			new ChatConversationUpdateCommand({
				id: this.id,
				entity: {
					title: this.conversation.title ,
					messages: [...(this.conversation.messages ?? []), message]
				}
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
