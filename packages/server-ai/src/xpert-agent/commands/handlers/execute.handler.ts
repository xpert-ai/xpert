import { NotFoundException } from '@nestjs/common'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, HumanMessage, isAIMessage, isAIMessageChunk, MessageContent, ToolMessage } from '@langchain/core/messages'
import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { Annotation, CompiledStateGraph, isCommand, LangGraphRunnableConfig, NodeInterrupt } from '@langchain/langgraph'
import { agentLabel, ChatMessageEventTypeEnum, ChatMessageTypeEnum, convertToUrlPath, IXpert, IXpertAgent, ToolCall, TSensitiveOperation, TStateVariable, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { AgentRecursionLimit, isNil } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { concat, filter, from, lastValueFrom, Observable, of, reduce, Subscriber, switchMap, tap } from 'rxjs'
import { AgentState } from '../../../copilot'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { createParameters, XpertAgentExecuteCommand } from '../execute.command'
import { GetXpertAgentQuery, GetXpertChatModelQuery } from '../../../xpert/queries'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { EnsembleRetriever } from "langchain/retrievers/ensemble"
import z from 'zod'
import { createReactAgent } from './react_agent_executor'
import { RunnableLambda } from '@langchain/core/runnables'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { getErrorMessage } from '@metad/server-common'
import { AgentStateAnnotation, parseXmlString, TSubAgent } from './types'
import { CompleteToolCallsQuery } from '../../queries'
import { memoryPrompt } from '../../../copilot-store/utils'


@CommandHandler(XpertAgentExecuteCommand)
export class XpertAgentExecuteHandler implements ICommandHandler<XpertAgentExecuteCommand> {
	readonly #logger = new Logger(XpertAgentExecuteHandler.name)

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecuteCommand): Promise<Observable<MessageContent>> {
		const { input, agentKey, xpert, options } = command
		const { execution, subscriber, toolCalls, reject, memories } = options
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()

		const abortController = new AbortController()

		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(new GetXpertAgentQuery(xpert.id, agentKey, command.options?.isDraft))
		if (!agent) {
			throw new NotFoundException(`Xpert agent not found for '${xpert.name}' and key ${agentKey} draft is ${command.options?.isDraft}`)
		}

		const team = agent.team

		const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
			new GetXpertChatModelQuery(agent.team, agent, {
				abortController,
				tokenCallback: (token) => {
					execution.tokens += token ?? 0
				}
			})
		)
		// Record ai model info into execution
		const copilotModel = agent.copilotModel ?? team.copilotModel
		execution.metadata = {
			provider: copilotModel.copilot.modelProvider?.providerName,
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model
		}

		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
			new ToolsetGetToolsCommand(options?.toolsets ?? agent.toolsetIds)
		)
		const tools = []
		const interruptBefore: string[] = []
		const stateVariables: TStateVariable[] = []
		for await (const toolset of toolsets) {
			stateVariables.push(...(toolset.getVariables() ?? []))
			const items = await toolset.initTools()
			tools.push(...items)
			interruptBefore.push(...items.filter((tool) => {
				const lc_name = get_lc_unique_name(tool.constructor as typeof Serializable)
				return team.agentConfig?.interruptBefore?.includes(lc_name)
			}).map((tool) => tool.name))
		}

		this.#logger.debug(`Use tools:\n ${[...tools,].map((_) => _.name + ': ' + _.description).join('\n')}`)

		// Knowledgebases
		const knowledgebaseIds = options?.knowledgebases ?? agent.knowledgebaseIds
		if (knowledgebaseIds?.length) {
			const retrievers = knowledgebaseIds.map((id) => createKnowledgeRetriever(this.queryBus, id))
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

		const subAgents: Record<string, TSubAgent> = {}
		if (agent.followers?.length) {
			this.#logger.debug(`Use sub agents:\n ${agent.followers.map((_) => _.name)}`)
			agent.followers.forEach((follower) => {
				const item = this.createXpertAgent(follower, { xpert, options: {
					rootExecutionId: command.options.rootExecutionId,
					isDraft: command.options.isDraft,
					subscriber
				}})
				subAgents[item.name] = item
				if (team.agentConfig?.interruptBefore?.includes(item.name)) {
					interruptBefore.push(item.name)
				}
			})
		}

		if (agent.collaborators?.length) {
			this.#logger.debug(`Use xpert collaborators:\n${agent.collaborators.map((_) => _.name)}`)
			for await (const collaborator of agent.collaborators) {
				const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(new GetXpertAgentQuery(collaborator.id,))
				const item = this.createXpertAgent(agent, { xpert: collaborator, options: {
					rootExecutionId: command.options.rootExecutionId,
					isDraft: false,
					subscriber
				}})
				subAgents[item.name] = item
				if (team.agentConfig?.interruptBefore?.includes(item.name)) {
					interruptBefore.push(item.name)
				}
			}
		}

		// Custom parameters
		const StateAnnotation = Annotation.Root({
			...AgentStateAnnotation.spec,
			...(stateVariables.reduce((acc, variable) => {
				acc[variable.name] = Annotation({
					reducer: variable.reducer,
					default: variable.default,
				  })
				return acc
			}, {}) ?? {}),
			...(agent.parameters?.reduce((acc, parameter) => {
				acc[parameter.name] = Annotation<string>
				return acc
			}, {}) ?? {}),
		})

		const thread_id = command.options.thread_id

		const graph = createReactAgent({
			stateSchema: StateAnnotation,
			llm: chatModel,
			checkpointSaver: this.copilotCheckpointSaver,
			subAgents,
			tools: tools,
			interruptBefore,
			tags: [thread_id],
			stateModifier: async (state: typeof AgentStateAnnotation.State) => {
				const { summary, memories } = state
				let systemTemplate = `{{sys_language}}\nCurrent time: ${new Date().toISOString()}\n${parseXmlString(agent.prompt) ?? ''}`
				if (memories?.length) {
					systemTemplate += `\n\n<memory>\n${memoryPrompt(memories)}\n</memory>`
				}
				if (summary) {
					systemTemplate += `\nSummary of conversation earlier: \n${summary}`
				}
				const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
					templateFormat: 'mustache'
				}).format({ ...state })

				this.#logger.verbose(`SystemMessage:`, systemMessage.content)
				return [systemMessage, ...state.messages]
			},
			summarize: team.summarize,
		})

		this.#logger.debug(`Start chat with xpert '${xpert.name}' & agent '${agent.title}'`)

		const config = {
			thread_id,
			checkpoint_ns: '',
		}
		if (reject) {
			await this.reject(graph, config)
		} else if (toolCalls) {
			await this.updateToolCalls(graph, config, toolCalls)
		}

		const eventStack: string[] = []
		// let toolCalls = null
		let prevEvent = ''
		const toolsMap: Record<string, string> = {} // For lc_name and name of tool is different
		const contentStream = from(
			graph.streamEvents(
				input?.input ? {
					...input,
					memories,
					messages: [new HumanMessage(input.input)]
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
					// debug: true
				},
			)
		).pipe(
			switchMap(async ({ event, tags, data, ...rest }: any) => {
				if (Logger.isLevelEnabled('debug')) {
					if (event === 'on_chat_model_stream') {
						if (prevEvent === 'on_chat_model_stream') {
							process.stdout.write('.')
						} else {
							this.#logger.debug(`on_chat_model_stream [${agentLabel(agent)}]`)
						}
					} else {
						if (prevEvent === 'on_chat_model_stream') {
							process.stdout.write('\n')
						}
						this.#logger.debug(`${event} [${agentLabel(agent)}]`)
					}
				} else {
					this.#logger.verbose(`${event} [${agentLabel(agent)}]`)
				}

				switch (event) {
					case 'on_chain_start': {
						eventStack.push(event)
						break
					}
					case 'on_chain_end': {
						let _event = eventStack.pop()
						if (_event === 'on_tool_start') {
							// 当调用 Tool 报错异常时会跳过 on_tool_end 事件，直接到此事件
							while(_event === 'on_tool_start') {
								_event = eventStack.pop()
							}
							// // Clear all error tool calls
							// if (toolCalls) {
							// 	Object.keys(toolCalls).filter((id) => !!toolCalls[id]).forEach((id) => {
							// 		subscriber.next({
							// 			data: {
							// 				type: ChatMessageTypeEnum.EVENT,
							// 				event: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
							// 				data: toolCalls[id]
							// 			}
							// 		} as MessageEvent)
							// 	})
							// 	toolCalls = null
							// }
						}
						
						// All chains end
						if (_event !== 'on_chain_start') {
							eventStack.pop()
						}
						break
					}
					case 'on_chat_model_start': {
						eventStack.push(event)
						break
					}
					case 'on_chat_model_end': {
						const _event = eventStack.pop()
						if (_event !== 'on_chat_model_start') {
							eventStack.pop()
						}
						if (prevEvent !== 'on_chat_model_stream') {
							if (tags.includes(thread_id)) {
								const msg = data.output as AIMessageChunk
								return msg.content
							}
						}
						return null
					}
					case 'on_chat_model_stream': {
						prevEvent = event
						// Only returns the stream events content of the current react agent (filter by tag: thread_id), not events of agent in tool call.
						if (tags.includes(thread_id)) {
							const msg = data.chunk as AIMessageChunk
							if (!msg.tool_call_chunks?.length) {
								if (msg.content) {
									return msg.content
								}
							}
						}
						break
					}
					
					case 'on_chain_stream': {
						// Only returns the stream events content of the current react agent (filter by tag: thread_id), not events of agent in tool call.
						if (tags.includes(thread_id)) {
							const msg = data.chunk as AIMessageChunk
							if (!msg.tool_call_chunks?.length) {
								if (msg.content) {
									return msg.content
								}
							}
						}
						break
					}
					
					case 'on_tool_start': {
						// this.#logger.verbose(data, rest)
						eventStack.push(event)
						toolsMap[rest.metadata.langgraph_node] = rest.name
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_TOOL_START,
								data: {
									data,
									...rest,
								}
							}
						} as MessageEvent)
						break
					}
					case 'on_tool_end': {
						// this.#logger.verbose(data, rest)
						const _event = eventStack.pop()
						if (_event !== 'on_tool_start') { // 应该不会出现这种情况吧？
							eventStack.pop()
						}

						let output = data.output
						if ( isCommand(output)) {
							const messages = (<AgentState>output.update)?.messages
							if (Array.isArray(messages)) {
								const toolMessage = messages[messages.length - 1]
								output = toolMessage
							}
						}
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_TOOL_END,
								data: {
									data: {...data, output},
									tags,
									...rest,
								}
							}
						} as MessageEvent)
						break
					}
					case 'on_retriever_start': {
						// this.#logger.verbose(data, rest)
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_RETRIEVER_START,
								data: {
									data,
									tags,
									...rest,
								}
							}
						} as MessageEvent)
						break
					}
					case 'on_retriever_end': {
						// this.#logger.verbose(data, rest)
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_RETRIEVER_END,
								data: {
									data,
									tags,
									...rest,
								}
							}
						} as MessageEvent)
						break
					}
					case 'on_custom_event': {
						this.#logger.verbose(data, rest)
						switch(rest.name) {
							case ChatMessageEventTypeEnum.ON_TOOL_ERROR: {
								subscriber.next({
									data: {
										type: ChatMessageTypeEnum.EVENT,
										event: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
										data: {
											...rest,
											...data,
											name: toolsMap[data.toolCall.name] ?? data.toolCall.name,
											tags,
										}
									}
								} as MessageEvent)
								break
							}
							case ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR: {
								subscriber.next({
									data: {
										type: ChatMessageTypeEnum.EVENT,
										event: ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR,
										data: {
											tags,
											...rest,
											name: data.knowledgebaseId,
											error: data.error
										}
									}
								} as MessageEvent)
								break
							}
						}
						break
					}
				}
				
				prevEvent = event
				return null
			}),
			tap({
				complete: async () => {
					//
				},
				error: (err) => {
					this.#logger.debug(err)
				},
				finalize: () => {
					//
				}
			})
		)

		return concat(contentStream, of(1).pipe(
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

				if (state.next?.[0]) {
					const messages = state.values.messages
					const lastMessage = messages[messages.length - 1]
					if (isAIMessageChunk(lastMessage)) {
						this.#logger.debug(`Interrupted chat [${agentLabel(agent)}].`)
						const operation = await this.queryBus.execute<CompleteToolCallsQuery, TSensitiveOperation>(
							new CompleteToolCallsQuery(xpert.id, agentKey, lastMessage, options.isDraft)
						)
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_INTERRUPT,
								data: operation
							}
						} as MessageEvent)
						throw new NodeInterrupt(`Confirm tool calls`)
					}
				} else {
					this.#logger.debug(`End chat [${agentLabel(agent)}].`)
				}
				return null
			})
		)).pipe(
			filter((content) => !isNil(content)),
		)
	}

	createXpertAgent(
		agent: IXpertAgent,
		config: {
			xpert: Partial<IXpert>
			options: {
				rootExecutionId: string
				isDraft: boolean
				subscriber: Subscriber<MessageEvent>
			}
		}
	) {
		const { xpert, options } = config
		const { subscriber } = options

	  const agentNode = RunnableLambda.from(async (state: AgentState, config: LangGraphRunnableConfig): Promise<Partial<AgentState>> => {
		const call = state.toolCall
		// console.log(call)
		/**
		 * @todo should record runId in execution
		 */
		const runId = config.runId

		// Record start time
		const timeStart = Date.now()
		const execution = await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				xpert: { id: xpert.id } as IXpert,
				agentKey: agent.key,
				inputs: call.args,
				parentId: options.rootExecutionId,
				parent_thread_id: config.configurable.thread_id,
				status: XpertAgentExecutionStatusEnum.RUNNING
			})
		)

		// Start agent execution event
		subscriber.next(
			({
				data: {
					type: ChatMessageTypeEnum.EVENT,
					event: ChatMessageEventTypeEnum.ON_AGENT_START,
					data: execution
				}
			}) as MessageEvent
		)

		let status = XpertAgentExecutionStatusEnum.SUCCESS
		let error = null
		let result = ''
		const finalize = async () => {
			const timeEnd = Date.now()
			// Record End time
			const newExecution = await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...execution,
					elapsedTime: timeEnd - timeStart,
					status,
					error,
					outputs: {
						output: result
					}
				})
			)

			const fullExecution = await this.queryBus.execute(
				new XpertAgentExecutionOneQuery(newExecution.id)
			)

			// End agent execution event
			subscriber.next(
				({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_AGENT_END,
						data: fullExecution
					}
				}) as MessageEvent
			)
		}
		try {
			const obs = await this.commandBus.execute<XpertAgentExecuteCommand, Observable<string>>(
				new XpertAgentExecuteCommand(call.args, agent.key, xpert, { ...options, thread_id: execution.threadId, execution })
			)
			
			await lastValueFrom(obs.pipe(
				reduce((acc, val) => acc + val, ''),
				tap({
					next: (text: string) => {
						result = text
					},
					error: (err) => {
						status = XpertAgentExecutionStatusEnum.ERROR
						error = getErrorMessage(err)
					},
					finalize: async () => {
						try {
							await finalize()
						} catch(err) {
							//
						}
					}
				}
			)))

			return {
				messages: [
				  new ToolMessage({
					content: result,
					name: call.name,
					tool_call_id: call.id ?? "",
				  })
				]
			  }
		} catch(err) {
			// Catch the error before generated obs
			try {
				status = XpertAgentExecutionStatusEnum.ERROR
				error = getErrorMessage(err)
				await finalize()
			} catch(err) {
				//
			}
			throw err
		}
	  })
	  const uniqueName = convertToUrlPath(agent.name) || agent.key
	  const agentTool = RunnableLambda.from(async (params: {input: string;} & any): Promise<string> => ``).asTool({
		name: uniqueName,
		description: agent.description,
		schema: z.object({
			...(createParameters(agent.parameters) ?? {}),
			input: z.string().describe('Ask me some question or give me task to complete')
		})
	  })

	  return {
		name: uniqueName,
		node: agentNode,
		tool: agentTool
	  } as TSubAgent
	}

	async reject(graph: CompiledStateGraph<any, any, any>, config: any) {
		const state = await graph.getState({configurable: config},)
		const messages = state.values.messages
		if (messages) {
			const lastMessage = messages[messages.length - 1]
			if (isAIMessage(lastMessage)) {
				await graph.updateState({configurable: config}, { messages: lastMessage.tool_calls.map((call) => {
					return new ToolMessage({
						name: call.name,
						content: `Error: Reject by user`,
						tool_call_id: call.id,
					})
				}) }, "agent")
			}
		}
	}

	async updateToolCalls(graph: CompiledStateGraph<any, any, any>, config: any, toolCalls: ToolCall[]) {
		// Update parameters of the last tool call message
		const state = await graph.getState({configurable: config},)
		const messages = state.values.messages
		const lastMessage = messages[messages.length - 1]
		if (lastMessage.id) {
			const newMessage = {
				role: "assistant",
				content: lastMessage.content,
				tool_calls: lastMessage.tool_calls.map((toolCall) => {
					const newToolCall = toolCalls.find((_) => _.id === toolCall.id)
					return {...toolCall, args: {...toolCall.args, ...(newToolCall?.args ?? {})} }
				}) ,
				id: lastMessage.id
			}
			await graph.updateState({configurable: config}, { messages: [newMessage]}, "agent")
		}
	}
	
}
