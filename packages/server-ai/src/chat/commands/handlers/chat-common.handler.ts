import { AIMessage, HumanMessage, isAIMessage, isBaseMessage, isToolMessage, MessageContent, RemoveMessage, ToolMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import {
	Annotation,
	CompiledStateGraph,
	END,
	isCommand,
	isParentCommand,
	NodeInterrupt,
	START,
	StateGraph
} from '@langchain/langgraph'
import {
	channelName,
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	CopilotChatMessage,
	GRAPH_NODE_TITLE_CONVERSATION,
	IChatConversation,
	IChatMessage,
	IEnvironment,
	IXpert,
	IXpertAgent,
	IXpertAgentExecution,
	IXpertProject,
	messageContentText,
	STATE_VARIABLE_HUMAN,
	STATE_VARIABLE_SYS,
	TAgentRunnableConfigurable,
	TChatConversationStatus,
	TSensitiveOperation,
	TStateVariable,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { appendMessageContent, isNil } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { ConfigService } from '@metad/server-config'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { format } from 'date-fns/format'
import { EnsembleRetriever } from 'langchain/retrievers/ensemble'
import { concat, filter, from, map, Observable, of, Subscriber, switchMap, tap } from 'rxjs'
import z from 'zod'
import { ChatConversationUpsertCommand } from '../../../chat-conversation'
import { appendMessageSteps, ChatMessageUpsertCommand } from '../../../chat-message'
import { CopilotGetChatQuery } from '../../../copilot'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import {
	CompileGraphCommand,
	createMapStreamEvents,
	CreateSummarizeTitleAgentCommand,
	messageEvent,
} from '../../../xpert-agent'
import {
	assignExecutionUsage,
	XpertAgentExecutionOneQuery,
	XpertAgentExecutionUpsertCommand
} from '../../../xpert-agent-execution'
import { CreateProjectToolsetCommand, XpertProjectService } from '../../../xpert-project/'
import { ChatCommonCommand } from '../chat-common.command'
import { _normalizeAgentName, createHandoffBackMessages, createHandoffTool } from './handoff'
import {
	Instruction,
	isChatModelWithBindTools,
	isChatModelWithParallelToolCallsParam,
	OutputMode,
	PlanInstruction,
	PROVIDERS_WITH_PARALLEL_TOOL_CALLS_PARAM
} from './supervisor'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { toEnvState } from '../../../environment'
import { ProjectToolset } from '../../../xpert-project/tools'
import { _BaseToolset, AgentStateAnnotation, BaseTool, stateToParameters, stateVariable, ToolNode, translate } from '../../../shared'

const GeneralAgentRecursionLimit = 99

@CommandHandler(ChatCommonCommand)
export class ChatCommonHandler implements ICommandHandler<ChatCommonCommand> {
	readonly #logger = new Logger(ChatCommonHandler.name)

	constructor(
		private readonly checkpointSaver: CopilotCheckpointSaver,
		private readonly projectService: XpertProjectService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly configService: ConfigService
	) {}

	public async execute(command: ChatCommonCommand): Promise<Observable<any>> {
		const { tenantId, organizationId, user, knowledgebases, from: chatFrom } = command.options
		const { conversationId, projectId, input, retry } = command.request
		const userId = RequestContext.currentUserId()
		const languageCode = command.options.language || user.preferredLanguage || 'en-US'

		let conversation: IChatConversation = null
		let userMessage: IChatMessage = null
		let aiMessage: IChatMessage = null
		if (isNil(conversationId)) {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					tenantId,
					organizationId,
					projectId: projectId,
					createdById: user.id,
					status: 'busy',
					options: {
						knowledgebases
					},
					from: chatFrom
				})
			)
		} else {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand(
					{
						id: conversationId,
						status: 'busy',
						error: null
					},
					['messages']
				)
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

		// Project & Xperts
		let project: IXpertProject
		if (projectId) {
			project = await this.projectService.findOne(projectId, {
				relations: ['copilotModel', 'copilotModel.copilot', 'xperts', 'xperts.agent', 'toolsets', 'knowledges', 'workspace', 'workspace.environments'] 
			})
		}

		const abortController = new AbortController()
		const executionId = execution.id
		const timeStart = Date.now()
		let status = XpertAgentExecutionStatusEnum.SUCCESS
		// Collect the output text into execution
		let result = ''
		let error = null
		let _execution = null
		let operation: TSensitiveOperation = null
		return new Observable<MessageEvent>((subscriber) => {
			(async () => {
				// Send conversation start event
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

				let graph: CompiledStateGraph<any, any, any> = null

				try {
					const thread_id = execution.threadId
					graph = await this.createReactAgent(command, project, execution, abortController, subscriber, conversation.id)
					// Run
					const config = {
						thread_id,
						checkpoint_ns: ''
					}

					const contentStream = from(
						graph.streamEvents(
							input?.input || retry
								? {
										...(input ?? {}),
										messages: [new HumanMessage(userMessage.content as string)],
										[STATE_VARIABLE_SYS]: {
											language: languageCode,
											user_email: user.email,
											timezone: user.timeZone || command.options.timeZone,
											date: format(new Date(), 'yyyy-MM-dd'),
											datetime: new Date().toLocaleString()
										}
									}
								: null,
							{
								version: 'v2',
								configurable: {
									...config,
									tenantId: tenantId,
									organizationId: organizationId,
									userId,
									projectId: project?.id,
									subscriber
								},
								recursionLimit: GeneralAgentRecursionLimit,
								signal: abortController.signal
							}
						)
					).pipe(
						map(createMapStreamEvents(this.#logger, subscriber, {
							xperts: project?.xperts,
							disableOutputs: [
								GRAPH_NODE_TITLE_CONVERSATION
							]
						}))
					)

					const recordLastState = async () => {
						const state = await graph.getState({
							configurable: {
								...config
							}
						})

						const { checkpoint, pendingWrites } = await this.checkpointSaver.getCopilotCheckpoint(
							state.config ?? state.parentConfig
						)

						// @todo checkpoint_id The source of the value should be wrong
						execution.checkpointNs = state.config?.configurable?.checkpoint_ns ?? checkpoint?.checkpoint_ns
						execution.checkpointId = state.config?.configurable?.checkpoint_id ?? checkpoint?.checkpoint_id

						if (pendingWrites?.length) {
							execution.checkpointNs = pendingWrites[0].checkpoint_ns
							execution.checkpointId = pendingWrites[0].checkpoint_id
						}
						// Update execution title from graph states
						if (state.values.title) {
							execution.title = state.values.title
						}

						return state
					}

					const complete = async () => {
						try {
							await recordLastState()

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
									}
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

					concat(
						contentStream,
						of(true).pipe(
							switchMap(async () => {
								const state = await graph.getState({
									configurable: {
										...config
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
						)
					)
						.pipe(
							filter((content) => !isNil(content)),
							map((messageContent: MessageContent) => {
								return {
									data: {
										type: ChatMessageTypeEnum.MESSAGE,
										data: messageContent
									}
								} as MessageEvent
							})
						)
						.subscribe({
							next: (message) => {
								subscriber.next(message)
							},
							error: (err) => {
								console.error(err)
								if (err instanceof NodeInterrupt) {
									status = XpertAgentExecutionStatusEnum.INTERRUPTED
									error = null
								} else {
									status = XpertAgentExecutionStatusEnum.ERROR
									error = getErrorMessage(err)
								}
								complete().catch((err) => this.#logger.error(err))
							},
							complete: async () => {
								complete().catch((err) => this.#logger.error(err))
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
				} catch (err) {
					console.error(err)
					this.#logger.error(err)
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
						appendMessageContent(aiMessage as CopilotChatMessage, event.data.data)
						result += messageContentText(event.data.data)
					} else if (
						event.data.type === ChatMessageTypeEnum.EVENT
					) {
						switch(event.data.event) {
							case (ChatMessageEventTypeEnum.ON_AGENT_END): {
								_execution = event.data.data
								break
							}
							case (ChatMessageEventTypeEnum.ON_INTERRUPT): {
								operation = event.data.data
								break
							}
							case (ChatMessageEventTypeEnum.ON_TOOL_MESSAGE): {
								appendMessageSteps(aiMessage, [event.data.data])
								break
							}
						}
					}
				},
				finalize: async () => {
					if (aiMessage) {
						try {
							// Update ai message
							aiMessage.status = status
							await this.commandBus.execute(new ChatMessageUpsertCommand(aiMessage))
						} catch (err) {
							this.#logger.error(err)
						}
					}
				}
			})
		)
	}

	async createReactAgent(
		command: ChatCommonCommand,
		project: IXpertProject,
		execution: IXpertAgentExecution,
		abortController: AbortController,
		subscriber: Subscriber<MessageEvent>,
		conversationId: string
	) {
		const { projectId } = command.request
		const { tenantId, organizationId } = command.options

		// Env
		let environment: IEnvironment
		if (project?.workspace?.environments?.length > 0) {
			environment = project.workspace.environments.find((_) => _.isDefault)
		}

		// Create tools
		const stateVariables: TStateVariable[] = []
		const toolsetVarirables: TStateVariable[] = []
		const tools: StructuredToolInterface[] = []
		/**
		 * Map of tool names to their titles
		 */
		const toolsTitleMap = {}
		/**
		 * The relationship between tool and toolset provider
		 */
		const toolsetsMap = {}
		// Project toolset for plan mode
		if (project?.settings?.mode === 'plan') {
			const projectToolset = await this.commandBus.execute<CreateProjectToolsetCommand, ProjectToolset>(new CreateProjectToolsetCommand(projectId))
			const _variables = await projectToolset.getVariables()
			toolsetVarirables.push(...(_variables ?? []))
			// stateVariables.push(...toolsetVarirables)
			const items = await projectToolset.initTools()
			items.forEach((tool) => {
				toolsTitleMap[tool.name] = translate(projectToolset.getToolTitle(tool.name))
				toolsetsMap[tool.name] = projectToolset.providerName
				tools.push(...items)
			})
		}
		
		// Custom toolsets
		if (project?.toolsets.length > 0) {
			const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, _BaseToolset<BaseTool>[]>(
				new ToolsetGetToolsCommand(project.toolsets.map(({id}) => id), {
					projectId: project.id,
					conversationId,
					xpertId: null,
					signal: abortController.signal,
					env: toEnvState(environment)
				})
			)
			abortController.signal.addEventListener('abort', () => {
				for (const toolset of toolsets) {
					toolset.close().catch((err) => this.#logger.debug(err))
				}
			})
			// const interruptBefore: string[] = []
			for await (const toolset of toolsets) {
				const _variables = await toolset.getVariables()
				toolsetVarirables.push(...(_variables ?? []))
				const items = await toolset.initTools()
				items.forEach((tool) => {
					// const lc_name = get_lc_unique_name(tool.constructor as typeof Serializable)
					toolsTitleMap[tool.name] = translate(toolset.getToolTitle(tool.name))
					toolsetsMap[tool.name] = toolset.providerName
					tools.push(tool)
				})
			}
		}

		this.#logger.debug(`Project general agent use tools:\n${[...tools].map((_, i) => `${i+1}. ` + _.name + ': ' + _.description).join('\n')}`)

		// Custom Knowledgebases
		if (project?.knowledges?.length) {
			const retrievers = project.knowledges.map(({id}) => createKnowledgeRetriever(this.queryBus, id))
			const retriever = new EnsembleRetriever({
				retrievers: retrievers,
				weights: retrievers.map(() => 0.5)
			})
			const knowledgeToolName = 'knowledge_retriever'
			toolsTitleMap[knowledgeToolName] = translate({zh_Hans: '知识检索', en_US: 'Knowledge Retrieval'})
			toolsetsMap[knowledgeToolName] = 'knowledge'
			tools.push(
				retriever.asTool({
					name: knowledgeToolName,
					description: 'Get information about question.',
					schema: z.string()
				}) as any
			)
		}

		stateVariables.push(...toolsetVarirables)
		// Find an available copilot
		let copilot = project?.copilotModel?.copilot
		let copilotModel = project?.copilotModel
		if (!copilotModel) {
			copilot = await this.queryBus.execute(new CopilotGetChatQuery(tenantId, organizationId))
			copilotModel = copilot.copilotModel
		}
		execution.metadata = {
			provider: copilot.modelProvider?.providerName,
			model: copilotModel?.model
		}

		const llm = await this.queryBus.execute(
			new CopilotModelGetChatModelQuery(copilot, null, {
				abortController,
				usageCallback: assignExecutionUsage(execution)
			})
		)

		const supervisorName = 'general_agent'
		// Custom Xperts
		const xperts: {name: string; agent; tool: DynamicStructuredTool}[] = []
		if (project?.xperts.length) {
			for await (const xpert of project.xperts) {
				const agent = await this.createXpertAgent(project, xpert, abortController, execution, subscriber, 'last_message', false, supervisorName)
				const tool = createHandoffTool({ agentName: agent.name, title: xpert.title, description: xpert.description })
				xperts.push({name: agent.name, agent, tool })
				toolsTitleMap[tool.name] = translate({en_US: 'Task handoff to:', zh_Hans: '任务移交给：'}) + (xpert.title || xpert.name)
				toolsetsMap[tool.name] = 'transfer_to'
			}
		}
		const shouldReturnDirect = new Set(
			tools
			  .filter((tool) => "returnDirect" in tool && tool.returnDirect)
			  .map((tool) => tool.name)
		  );
		const routeToolResponses = (state: typeof AgentStateAnnotation.State) => {
			// Check the last consecutive tool calls
			for (let i = state.messages.length - 1; i >= 0; i -= 1) {
			  const message = state.messages[i];
			  if (!isToolMessage(message)) {
				break;
			  }
			  // Check if this tool is configured to return directly
			  if (message.name !== undefined && shouldReturnDirect.has(message.name)) {
				return END;
			  }
			  // Check if this tool is handoff tool
			  const xpert = xperts.find((_) => _.tool.name === message.name)
			  if (xpert) {
				return xpert.name
			  }
			}
			return supervisorName
		  };

		const thread_id = execution.threadId
		
		const allTools = [...(tools ?? []), ...xperts.map(({tool}) => tool)]

		const agentNames = new Set<string>()
		for (const xpert of xperts) {
			const agent = xpert.agent
			if (!agent.name || agent.name === "LangGraph") {
			  throw new Error(
				"Please specify a name when you create your agent, either via `createReactAgent({ ..., name: agentName })` " +
				  "or via `graph.compile({ name: agentName })`."
			  );
			}
		
			if (agentNames.has(agent.name)) {
			  throw new Error(
				`Agent with name '${agent.name}' already exists. Agent names must be unique.`
			  );
			}
		
			agentNames.add(agent.name);
		  }

		let supervisorLLM = llm
		if (allTools.length && isChatModelWithBindTools(llm)) {
			if (
				isChatModelWithParallelToolCallsParam(llm) &&
				PROVIDERS_WITH_PARALLEL_TOOL_CALLS_PARAM.has(llm.getName())
			) {
				supervisorLLM = llm.bindTools(allTools, { parallel_tool_calls: false })
			} else {
				supervisorLLM = llm.bindTools(allTools)
			}
		}

		let supervisorPrompt = ''
		if (xperts.length > 0) {
			supervisorPrompt +=
				'\nYou are a team leader who manages the following experts. Please assign them tasks to solve user problems:' +
				project.xperts.reduce((prompt, xpert) => {
					prompt += `- xpert_${xpert.slug}: I am ${xpert.title || xpert.name}. ${xpert.description}\n\n`
					return prompt
				}, '')
		}

		const stateAnnotation = createStateAnnotation(stateVariables)

		const callModel = async (state: typeof AgentStateAnnotation.State, config?: RunnableConfig) => {
			const parameters = stateToParameters(state)
			let systemTemplate = `Current time: ${new Date().toISOString()}\n` + (project?.settings?.instruction || supervisorPrompt) + '\n\n' + Instruction

			if (project?.settings?.mode === 'plan') {
				systemTemplate += `\n\n` + PlanInstruction
			}

			// const files = await fileToolset?.listFiles('project', projectId)
			// if (files) {
			// 	systemTemplate += '\n\n' + `The list of files in the current workspace is:\n${files.map(({filePath}) => filePath).join('\n') || 'No files yet.'}\n`
			// }
			const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
				templateFormat: 'mustache'
			}).format(parameters)

			this.#logger.verbose(`System message of project general agent:`, systemMessage.content)
			return { messages: [await supervisorLLM.invoke([systemMessage, ...state.messages], config)] }
		}

		let builder = new StateGraph(stateAnnotation)
			.addNode(
				supervisorName,
				new RunnableLambda({ func: callModel }).withConfig({
					runName: supervisorName,
					tags: [thread_id, projectId]
				}),
			)
			.addEdge(START, supervisorName)
			.addNode('tools', new ToolNode(allTools, {toolsets: toolsetsMap}), {metadata: { ...toolsTitleMap }})
			.addConditionalEdges("tools", routeToolResponses,)
			.addConditionalEdges(supervisorName, (state, config) => {
				const { title } = state
				const messages = state.messages ?? []
				const lastMessage = messages[messages.length - 1]
				if (isBaseMessage(lastMessage) && isAIMessage(lastMessage)) {
					if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
						if (!title) {
							return GRAPH_NODE_TITLE_CONVERSATION
						}
					} else {
						return 'tools'
					}
				}
				return END
			})

		const titleAgent = await this.commandBus.execute(
			new CreateSummarizeTitleAgentCommand({
				copilot,
				rootController: abortController,
				rootExecutionId: execution.id,
				channel: null
			})
		)

		builder.addNode(GRAPH_NODE_TITLE_CONVERSATION, titleAgent).addEdge(GRAPH_NODE_TITLE_CONVERSATION, END)

		for (const xpert of xperts) {
			const agent = xpert.agent
			builder = builder.addNode(agent.name, agent, {
				subgraphs: [agent]
			})
			builder = builder.addEdge(agent.name as any, supervisorName)
		}

		return builder.compile({
			checkpointer: this.checkpointSaver
		})
	}

	/**
	 * Create agent graph for xpert
	 */
	async createXpertAgent(
		project: IXpertProject,
		xpert: IXpert,
		abortController: AbortController,
		execution: IXpertAgentExecution,
		subscriber: Subscriber<MessageEvent>,
		outputMode: OutputMode,
		addHandoffBackMessages: boolean,
		supervisorName: string,
	) {
		const name = `xpert_` + xpert.slug
		// Sub execution for xpert
		const _execution: IXpertAgentExecution = {}
		const { graph, agent } = await this.commandBus.execute<
			CompileGraphCommand,
			{ graph: CompiledStateGraph<unknown, unknown>; agent: IXpertAgent }
		>(
			new CompileGraphCommand(xpert.agent.key, xpert, {
				execution: _execution,
				rootExecutionId: execution.id,
				rootController: abortController,
				signal: abortController.signal,
				subscriber,
				projectId: project?.id,
			})
		)
		
		const runnable = new RunnableLambda({
			func: async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { subscriber } = configurable
				// Record start time
				const timeStart = Date.now()
				const __execution = await this.commandBus.execute(
					new XpertAgentExecutionUpsertCommand({
						..._execution,
						threadId: config.configurable.thread_id,
						checkpointNs: config.configurable.checkpoint_ns,
						xpert: { id: xpert.id } as IXpert,
						// agentKey: xpert.agent.key,
						inputs: { input: state.input },
						parentId: execution.id,
						status: XpertAgentExecutionStatusEnum.RUNNING,
						predecessor: configurable.agentKey
					})
				)

				// Start agent execution event
				subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_START, __execution))

				// Exec
				let status = XpertAgentExecutionStatusEnum.SUCCESS
				let error = null
				let result = ''
				const finalize = async () => {
					const _state = await graph.getState(config)

					const timeEnd = Date.now()
					// Record End time
					const ___execution = await this.commandBus.execute(
						new XpertAgentExecutionUpsertCommand({
							..._execution,
							id: __execution.id,
							checkpointId: _state.config.configurable.checkpoint_id,
							elapsedTime: timeEnd - timeStart,
							status,
							error,
							outputs: {
								output: result
							}
						})
					)

					const fullExecution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(___execution.id))

					// End agent execution event
					subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_END, fullExecution))
				}

				const _messages = Array.from(state.messages)
				const primaryChannelName = channelName(xpert.agent.key)
				let toolMessage = null
				let aiMessage: AIMessage = null
				while (_messages.length > 0) {
					const message = _messages.pop()
					if (isBaseMessage(message)) {
						if (isAIMessage(message)) {
							aiMessage = message
							break
						} else if (isToolMessage(message) && message.name.includes(_normalizeAgentName(name))) {
							toolMessage = message
						}
					}
				}
				if (!aiMessage) {
					throw new Error(`CAN NOT found AiMessage for transfer back of xpert`)
				}
				if (!toolMessage) {
					throw new Error(`CAN NOT found ToolMessage for transfer back of xpert`)
				}
				let input = null
				let tool_call_id = null
				let tool_name = null
				const toolCalls = Array.from(aiMessage.tool_calls)
				while (toolCalls.length > 0) {
					const tool_call = toolCalls.pop()
					if (tool_call.name.includes(_normalizeAgentName(name))) {
						input = tool_call.args?.input
						tool_call_id = tool_call.id
						tool_name = tool_call.name
						break
					}
				}
				
				try {
					const output = await graph.invoke(
						{
							...state,
							input: input,
							[STATE_VARIABLE_HUMAN]: {
								input,
								files: state.files || [],
							},
							messages: [],
							[primaryChannelName]: {
								messages: []
							}
						},
						{ 
							...config, 
							configurable: { 
								...config.configurable, 
								agentKey: '', // In the general agent, messages do not distinguish between Agents but only between Xperts.
								xpertName: xpert.name
							},
							metadata: {
								agentKey: '', // In the general agent, messages do not distinguish between Agents but only between Xperts.
								xpertName: xpert.name
							}
						}
					)

					let { messages } = output

					const lastMessage = messages[messages.length - 1]
					if (lastMessage && isAIMessage(lastMessage)) {
						result = lastMessage.content as string
					}

					if (outputMode === 'last_message') {
						messages = [
							new ToolMessage({
								name: tool_name,
								content: result,
								tool_call_id,
							})
						]
					}

					if (addHandoffBackMessages) {
						messages.push(...createHandoffBackMessages(agent.name, supervisorName))
					}
					return { ...output, messages: [new RemoveMessage({id: toolMessage.id}), ...messages] }
				} catch (err) {
					if (!isParentCommand(err) && !isCommand(err)) {
						error = getErrorMessage(err)
						status = XpertAgentExecutionStatusEnum.ERROR
					}
					throw err
				} finally {
					// End agent execution event
					await finalize()
				}
			}
		})
		runnable.name = name
		return runnable
	}
}

function createStateAnnotation(stateVariables: TStateVariable[]) {
	return Annotation.Root({
		...AgentStateAnnotation.spec, // Common agent states
		// Global conversation variables
		...(stateVariables.reduce((acc, variable) => {
			acc[variable.name] = Annotation({
				...(variable.reducer ? {
					reducer: variable.reducer,
					default: variable.default,
				} : stateVariable(variable)),
				})
			return acc
		}, {}) ?? {})
	})
}