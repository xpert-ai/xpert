import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { AIMessageChunk, BaseMessage, HumanMessage, isAIMessage, isAIMessageChunk, isBaseMessage, isBaseMessageChunk, ToolMessage } from '@langchain/core/messages'
import { HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableConfig, RunnableLambda, RunnableLike } from '@langchain/core/runnables'
import {
	Annotation,
	CompiledStateGraph,
	END,
	LangGraphRunnableConfig,
	messagesStateReducer,
	Send,
	START,
	StateGraph
} from '@langchain/langgraph'
import { channelName, ChatMessageEventTypeEnum, ChatMessageTypeEnum, convertToUrlPath, IWFNIfElse, IXpert, IXpertAgent, IXpertAgentExecution, TStateVariable, TSummarize, TWFCaseCondition, TXpertGraph, TXpertTeamNode, WorkflowComparisonOperator, WorkflowLogicalOperator, WorkflowNodeTypeEnum, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { getErrorMessage, isEmpty } from '@metad/server-common'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'
import z from 'zod'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { memoryPrompt } from '../../../copilot-store/utils'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertWorkflowQuery, GetXpertChatModelQuery, GetXpertAgentQuery } from '../../../xpert/queries'
import { createParameters } from '../execute.command'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { ToolNode } from './tool_node'
import { AgentStateAnnotation, parseXmlString, stateVariable, TGraphTool, TSubAgent } from './types'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { createTitleAgent, createSummarizeAgent } from './react_agent_executor'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { EnsembleRetriever } from 'langchain/retrievers/ensemble'
import { ChatOpenAI } from '@langchain/openai'
import { isNil } from 'lodash'


@CommandHandler(XpertAgentSubgraphCommand)
export class XpertAgentSubgraphHandler implements ICommandHandler<XpertAgentSubgraphCommand> {
	readonly #logger = new Logger(XpertAgentSubgraphHandler.name)

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentSubgraphCommand): Promise<{agent: IXpertAgent; graph: CompiledStateGraph<unknown, unknown, any>; nextNodes: TXpertTeamNode[]}> {
		const { agentKeyOrName, xpert, options } = command
		const { isStart, execution, leaderKey, summarizeTitle, subscriber, rootController, signal } = options

		// Signal controller in this subgraph
		const abortController = new AbortController()
		signal?.addEventListener('abort', () => abortController.abort())

		const {agent, graph, next} = await this.queryBus.execute<GetXpertWorkflowQuery, {agent: IXpertAgent; graph: TXpertGraph; next: TXpertTeamNode[]}>(
			new GetXpertWorkflowQuery(xpert.id, agentKeyOrName, command.options?.isDraft)
		)
		if (!agent) {
			throw new NotFoundException(
				`Xpert agent not found for '${xpert.name}' and key or name '${agentKeyOrName}', draft is ${command.options?.isDraft}`
			)
		}

		// The xpert (agent team)
		const team = agent.team
		const agentKey = agent.key
		const agentChannel = channelName(agent.key)
		const thread_id = command.options.thread_id

		// LLM
		const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
			new GetXpertChatModelQuery(agent.team, agent, {
				abortController: rootController,
				usageCallback: assignExecutionUsage(execution)
			})
		)

		// Record ai model info into execution
		const copilotModel = agent.copilotModel ?? team.copilotModel
		execution.metadata = {
			provider: copilotModel.copilot.modelProvider?.providerName,
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model
		}

		// Create tools
		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
			new ToolsetGetToolsCommand(options?.toolsets ?? agent.toolsetIds, {
				xpertId: xpert.id,
				agentKey
			})
		)
		const tools: TGraphTool[] = []
		const interruptBefore: string[] = []
		const stateVariables: TStateVariable[] = Array.from(team.agentConfig?.stateVariables ?? [])
		for await (const toolset of toolsets) {
			stateVariables.push(...(toolset.getVariables() ?? []))
			const items = await toolset.initTools()
			items.forEach((tool) => {
				const lc_name = get_lc_unique_name(tool.constructor as typeof Serializable)
				tools.push({ caller: agent.key, tool, variables: team.agentConfig?.toolsMemory?.[lc_name] })

				// Add sensitive tools into interruptBefore
				if (team.agentConfig?.interruptBefore?.includes(lc_name)) {
					interruptBefore.push(tool.name)
				}
			})
		}

		this.#logger.debug(`Use tools:\n ${[...tools].map((_) => _.tool.name + ': ' + _.tool.description).join('\n')}`)

		// Knowledgebases
		const knowledgebaseIds = options?.knowledgebases ?? agent.knowledgebaseIds
		if (knowledgebaseIds?.length) {
			const retrievers = knowledgebaseIds.map((id) => createKnowledgeRetriever(this.queryBus, id))
			const retriever = new EnsembleRetriever({
				retrievers: retrievers,
				weights: retrievers.map(() => 0.5),
			  })
			tools.push({
				caller: agent.key,
				tool: retriever.asTool({
					name: "knowledge_retriever",
					description: "Get information about question.",
					schema: z.string(),
				  })
			})
		}

		// Sub agents
		const subAgents: Record<string, TSubAgent> = {}
		if (agent.followers?.length) {
			this.#logger.debug(`Use sub agents:\n ${agent.followers.map((_) => _.name)}`)
			for await (const follower of agent.followers) {
				const item = await this.createAgentSubgraph(follower, {
					xpert,
					options: {
						leaderKey: agent.key,
						rootExecutionId: command.options.rootExecutionId,
						isDraft: command.options.isDraft,
						subscriber
					},
					thread_id,
					rootController,
					signal,
					isTool: true
				})

				subAgents[item.name] = item
				if (team.agentConfig?.interruptBefore?.includes(item.name)) {
					interruptBefore.push(item.name)
				}
			}
		}

		// Collaborators (external xperts)
		if (agent.collaborators?.length) {
			this.#logger.debug(`Use xpert collaborators:\n${agent.collaborators.map((_) => _.name)}`)
			for await (const collaborator of agent.collaborators) {
				const {agent} = await this.queryBus.execute<GetXpertWorkflowQuery, {agent: IXpertAgent}>(new GetXpertWorkflowQuery(collaborator.id,))
				const item = await this.createAgentSubgraph(agent, {
					xpert: collaborator,
					options: {
						leaderKey: agent.key,
						rootExecutionId: command.options.rootExecutionId,
						isDraft: false,
						subscriber
					},
					thread_id,
					rootController,
					signal,
					isTool: true
				})
				
				subAgents[item.name] = item
				if (team.agentConfig?.interruptBefore?.includes(item.name)) {
					interruptBefore.push(item.name)
				}
			}
		}

		const withTools = [...tools.map((item) => item.tool), ...Object.keys(subAgents ?? {}).map((name) => subAgents[name].tool)]
		const summarize = ensureSummarize(team.summarize)
		// Next agent
		let nextNodeKey = END
		const agentKeys = new Set([agent.key])
		const nodes = {}
		const conditionalEdges: Record<string, [RunnableLike, string[]?]> = {}
		const edges: Record<string, string> = {}
		if (isStart) {
			/**
			 * The root node is responsible for the overall workflow
			 * 
			 * @param node 
			 * @param parentKey The pre-node of this node
			 * @param isPrimary is the root agent call
			 * @param nexts Nexts nodes of primary agent call
			 * @returns 
			 */
			const createSubgraph = async (node: TXpertTeamNode, parentKey?: string, isPrimary?: boolean, nexts?: string[]) => {
				if (node.type === 'agent') {
					if (parentKey) {
						if (isPrimary) {
							conditionalEdges[parentKey] = [createAgentNavigator(channelName(parentKey), summarize, summarizeTitle, node.key), [...nexts, node.key]]
						} else {
							edges[parentKey] = node.key
						}
					}
					if (agentKeys.has(node.key)) {
						return
					}
					agentKeys.add(node.key)
					const {stateGraph, nextNodes} = await this.createAgentSubgraph(node.entity, {
						xpert,
						options: {
							leaderKey: parentKey,
							rootExecutionId: command.options.rootExecutionId,
							isDraft: command.options.isDraft,
							subscriber
						},
						thread_id,
						rootController,
						signal,
						isTool: false
					})
	
					nodes[node.key] = stateGraph

					for await (const nNode of nextNodes ?? []) {
						await createSubgraph(nNode, node.key)
					}
				} else if(node.type === 'workflow') {
					const { workflowNode, nextNodes } = createWorkflowNode(graph, node,)
					nodes[node.key] = (state) => {
						//
					}
					conditionalEdges[node.key] = [workflowNode, nextNodes.map((n) => n.key)]
					if (parentKey) {
						if (isPrimary) {
							conditionalEdges[parentKey] = [createAgentNavigator(channelName(parentKey), summarize, summarizeTitle, node.key), [...nexts, node.key]]
						} else {
							edges[parentKey] = node.key
						}
					}
					for await (const nNode of nextNodes ?? []) {
						await createSubgraph(nNode)
					}
				}
			}

			for await (const node of next ?? []) {
				await createSubgraph(node, agentKey, true, withTools.map((tool) => tool.name))
				nextNodeKey = node.key
			}
		}
		if (leaderKey) {
			agentKeys.add(leaderKey)
		}

		// State
		const SubgraphStateAnnotation = Annotation.Root({
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
			}, {}) ?? {}),
			// Messages channel for agents
			...Object.fromEntries(Array.from(agentKeys).map((curr) => [
				`${curr}.messages`,
				Annotation<BaseMessage[]>({
					reducer: messagesStateReducer,
					default: () => []
				})
			])),
			// Channels for agents
			...Object.fromEntries(Array.from(agentKeys).map((curr) => [
				channelName(curr),
				Annotation<{messages: BaseMessage[]} & Record<string, unknown>>({
					reducer: (a, b) => {
						return b ? {
							...a,
							...b,
							messages: b.messages ? messagesStateReducer(a.messages, b.messages) : a.messages
						} : a
					},
					default: () => ({messages: []})
				})
			]))
		})

		const enableMessageHistory = !agent.options?.disableMessageHistory
		const stateModifier = async (state: typeof AgentStateAnnotation.State) => {
			const { memories } = state
			const summary = state[agentChannel]?.summary
			const parameters = stateToParameters(state)
			let systemTemplate = `Current time: ${new Date().toISOString()}\n${parseXmlString(agent.prompt) ?? ''}`
			if (memories?.length) {
				systemTemplate += `\n\n<memory>\n${memoryPrompt(memories)}\n</memory>`
			}
			if (summary) {
				systemTemplate += `\nSummary of conversation earlier: \n${summary}`
			}
			const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
				templateFormat: 'mustache'
			}).format(parameters)

			this.#logger.verbose(`SystemMessage:`, systemMessage.content)

			return {
				systemMessage,
				messageHistory: enableMessageHistory ? state[agentChannel]?.messages ?? [] : [],
				humanMessages: agent.promptTemplates ? await Promise.all(
					agent.promptTemplates.map((temp) =>
						HumanMessagePromptTemplate.fromTemplate(temp.text, {
							templateFormat: 'mustache'
						}).format(parameters)
					)
				) : []
			}
		}

		// Execute agent
		const callModel = async (state: typeof SubgraphStateAnnotation.State, config?: RunnableConfig) => {
			// With tools or with StructuredOutput
			let chatModelWithTools = null
			if (withTools.length) {
				if (!isNil(agent.options?.parallelToolCalls) && chatModel instanceof ChatOpenAI) {
					chatModelWithTools = chatModel.bindTools(withTools, {parallel_tool_calls: agent.options.parallelToolCalls})
				} else {
					chatModelWithTools = chatModel.bindTools(withTools)
				}
			} else {
				chatModelWithTools = agent.outputVariables?.length ? chatModel.withStructuredOutput(z.object({
					...createParameters(agent.outputVariables),
				})) : chatModel
			}

			const {systemMessage, messageHistory, humanMessages} = await stateModifier(state)

			const message = await chatModelWithTools.invoke([systemMessage, ...messageHistory, ...humanMessages], {...config, signal: abortController.signal})

			const nState: Record<string, any> = {
				messages: [],
				[`${agentKey}.messages`]: [...humanMessages],
				[channelName(agentKey)]: {messages: [...humanMessages]}
			}
			if (isBaseMessageChunk(message) && isAIMessageChunk(message)) {
				nState.messages.push(message)
				nState[`${agentKey}.messages`].push(message)
				nState[channelName(agentKey)].messages.push(message)
			} else {
				nState[channelName(agentKey)] = message
			}
			// Write to memory
			if (isStart && agent.options?.memories) {
				agent.options?.memories.forEach((item) => {
					if (item.inputType === 'constant') {
						nState[item.variableSelector] = item.value
					} else if (item.inputType === 'variable') {
						if (item.value === 'content' && isAIMessageChunk(message as AIMessageChunk)) {
							nState[item.variableSelector] = (message as AIMessageChunk).content
						}
					}
				})
			}
			return nState
		}

		const subgraphBuilder = new StateGraph(SubgraphStateAnnotation)
			.addNode(
				agentKey,
				new RunnableLambda({ func: callModel }).withConfig({ runName: agentKey, tags: [thread_id, xpert.id, agentKey] })
			)
			.addEdge(START, agentKey)

		// Add nodes for tools
		const endNodes = team.agentConfig?.endNodes
		tools?.forEach(({ caller, tool, variables }) => {
			const name = tool.name
			subgraphBuilder
				.addNode(name, new ToolNode([tool], { caller, variables }))
				.addEdge(name, endNodes?.includes(tool.name) ? nextNodeKey : agentKey)
		})

		// Subgraphs
		if (subAgents) {
			Object.keys(subAgents).forEach((name) => {
				subgraphBuilder.addNode(name, subAgents[name].stateGraph)
					.addEdge(name, endNodes?.includes(name) ? nextNodeKey : agentKey)
			})
		}

		if (summarizeTitle) {
			subgraphBuilder.addNode("title_conversation", createTitleAgent(chatModel, agentKey))
				.addEdge("title_conversation", END)
		}
		if (summarize?.enabled) {
			subgraphBuilder.addNode("summarize_conversation", createSummarizeAgent(chatModel, summarize, agentKey))
				.addEdge("summarize_conversation", END)
		}

		if (!Object.keys(nodes).length) {
			subgraphBuilder.addConditionalEdges(agentKey, createAgentNavigator(agentChannel, summarize, summarizeTitle, null))
		} else {
			// Next nodes
			Object.keys(nodes).forEach((name) => subgraphBuilder.addNode(name, nodes[name]))
			Object.keys(edges).forEach((name) => subgraphBuilder.addEdge(name, edges[name]))
			Object.keys(conditionalEdges).forEach((name) => subgraphBuilder.addConditionalEdges(name, conditionalEdges[name][0], conditionalEdges[name][1]))
		}

		return {
			agent,
			graph: subgraphBuilder.compile({
				checkpointer: this.copilotCheckpointSaver,
				interruptBefore: []
			}),
			nextNodes: next
		}
	}

	/**
	 * Create two types of sub-agent graphs (isTool):
	 * - Tool: Sub graph as a tool
	 * - Node: Sub graph as subsequent node
	 * 
	 * @param agent 
	 * @param config 
	 * @returns 
	 */
	async createAgentSubgraph(
		agent: IXpertAgent,
		config: {
			xpert: Partial<IXpert>
			options: {
				leaderKey: string
				rootExecutionId: string
				isDraft: boolean
				subscriber: Subscriber<MessageEvent>
			};
			thread_id: string
			rootController: AbortController
			signal: AbortSignal
			isTool: boolean
		}
	) {
		const { xpert, options, isTool, thread_id, rootController, signal } = config
		const { subscriber, leaderKey } = options
		const execution: IXpertAgentExecution = {}

		// Subgraph
		const {graph, nextNodes} = await this.commandBus.execute<XpertAgentSubgraphCommand, {graph: CompiledStateGraph<unknown, unknown>; nextNodes: TXpertTeamNode[]}>(
			new XpertAgentSubgraphCommand(agent.key, xpert, {
				thread_id,
				rootController,
				signal,
				isStart: isTool,
				leaderKey,
				rootExecutionId: config.options.rootExecutionId,
				isDraft: config.options.isDraft,
				subscriber,
				execution
			})
		)

		const uniqueName = convertToUrlPath(agent.name) || agent.key
		const agentTool = RunnableLambda.from(async (params: { input: string } & any): Promise<string> => ``).asTool({
			name: uniqueName,
			description: agent.description,
			schema: z.object({
				...(createParameters(agent.parameters) ?? {}),
				input: z.string().describe('Ask me some question or give me task to complete')
			})
		})

		const stateGraph = RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config: LangGraphRunnableConfig): Promise<Partial<typeof AgentStateAnnotation.State>> => {
			const call = state.toolCall
			execution.threadId = config.configurable.thread_id
			execution.checkpointNs = config.configurable.checkpoint_ns

			// Record start time
			const timeStart = Date.now()
			const _execution = await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...execution,
					xpert: { id: xpert.id } as IXpert,
					agentKey: agent.key,
					inputs: call?.args,
					parentId: options.rootExecutionId,
					status: XpertAgentExecutionStatusEnum.RUNNING
				})
			)

			// Start agent execution event
			subscriber.next(
				({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_AGENT_START,
						data: _execution
					}
				}) as MessageEvent
			)

			let status = XpertAgentExecutionStatusEnum.SUCCESS
			let error = null
			let result = ''
			const finalize = async () => {
				const _state = await graph.getState(config)

				const timeEnd = Date.now()
				// Record End time
				const newExecution = await this.commandBus.execute(
					new XpertAgentExecutionUpsertCommand({
						..._execution,
						checkpointId: _state.config.configurable.checkpoint_id,
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
				const subState = {
					...state,
					...(isTool ? {
						...call.args,
						[`${agent.key}.messages`]: [new HumanMessage(call.args.input)]
					} : {}),
				}
				const output = await graph.invoke(subState, {...config, signal})

				const lastMessage = output.messages[output.messages.length - 1]
				if (lastMessage && isAIMessage(lastMessage)) {
					result = lastMessage.content as string
				}
				
				// End agent execution event
				await finalize()

				const nState: Record<string, any> = isTool ? {
					[`${leaderKey}.messages`]: [
						new ToolMessage({
							content: lastMessage.content,
							name: call.name,
							tool_call_id: call.id ?? "",
						})
					],
					[`${agent.key}.messages`]: [lastMessage],
					[channelName(leaderKey)]: {
						messages: [
							new ToolMessage({
								content: lastMessage.content,
								name: call.name,
								tool_call_id: call.id ?? "",
							})
						]
					},
					[channelName(agent.key)]: {
						messages: [lastMessage]
					}
				} : {
					messages: [lastMessage],
					[`${agent.key}.messages`]: [lastMessage],
					[channelName(agent.key)]: {
						messages: [lastMessage]
					}
				}
				// Write to memory
				agent.options?.memories?.forEach((item) => {
					if (item.inputType === 'constant') {
						nState[item.variableSelector] = item.value
					} else if (item.inputType === 'variable') {
						if (item.value === 'content') {
							nState[item.variableSelector] = lastMessage.content
						}
						// @todo more variables
					}
				})
				
				return nState
			} catch(err) {
				error = getErrorMessage(err)
				status = XpertAgentExecutionStatusEnum.ERROR
				// End agent execution event
				await finalize()
				throw err
			}
		})

		return {
			name: uniqueName,
			tool: agentTool,
			nextNodes,
			stateGraph
		} as TSubAgent
	}
}

function ensureSummarize(summarize?: TSummarize) {
	return (
		summarize && {
			...summarize,
			maxMessages: summarize.maxMessages ?? 100,
			retainMessages: summarize.retainMessages ?? 90
		}
	)
}

function createAgentNavigator(agentChannel: string, summarize: TSummarize, summarizeTitle: boolean, next?: (string | ((state, config) => string))) {
	return (state: typeof AgentStateAnnotation.State, config) => {
		const { title } = state
		const messages = state[agentChannel]?.messages ?? []
		const lastMessage = messages[messages.length - 1]
		if (isBaseMessage(lastMessage) && isAIMessage(lastMessage)) {
			if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
				// If there are more than six messages, then we summarize the conversation
				if (summarize?.enabled && messages.length > summarize.maxMessages) {
					return 'summarize_conversation'
				} else if (!title && summarizeTitle) {
					return 'title_conversation'
				}

				if (next) {
					if (typeof next === 'string') {
						return next
					} else {
						return next(state, config)
					}
				}

				return END
			}

			return lastMessage.tool_calls.map((toolCall) => new Send(toolCall.name, { ...state, toolCall }))
		}

		if (next) {
			if (typeof next === 'string') {
				return next
			} else {
				return next(state, config)
			}
		}
		return END
	}
}

function stateToParameters(state: typeof AgentStateAnnotation.State,) {
	return Object.keys(state).reduce((acc, key) => {
		acc[key] = state[key]
		if (key.endsWith('.messages')) {
			if (Array.isArray(state[key])) {
				const lastMessage = state[key][state[key].length - 1]
				if (lastMessage && isAIMessage(lastMessage)) {
					acc[key.replace('.messages', '')] = {
						output: lastMessage.content
					}
				}
			}
		}
		return acc
	}, {})
}

function createWorkflowNode(graph: TXpertGraph, node: TXpertTeamNode & {type: 'workflow'}) {

	let workflowNode = null
	
	if (node.entity.type === WorkflowNodeTypeEnum.IF_ELSE) {
		const entity = node.entity as IWFNIfElse
		const evaluateCases = (state: typeof AgentStateAnnotation.State, config) => {
			const evaluateCondition = (condition: TWFCaseCondition) => {
				const stateValue = state[condition.variableSelector];
				if (typeof stateValue === 'number') {
					const conditionValue = Number(condition.value)
					switch (condition.comparisonOperator) {
						case WorkflowComparisonOperator.EQUAL:
							return stateValue === conditionValue
						case WorkflowComparisonOperator.NOT_EQUAL:
							return stateValue !== conditionValue
						case WorkflowComparisonOperator.GT:
							return stateValue > conditionValue
						case WorkflowComparisonOperator.LT:
							return stateValue < conditionValue
						case WorkflowComparisonOperator.GE:
							return stateValue >= conditionValue
						case WorkflowComparisonOperator.LE:
							return stateValue <= conditionValue
						case WorkflowComparisonOperator.EMPTY:
							return stateValue == null
						case WorkflowComparisonOperator.NOT_EMPTY:
							return stateValue != null
						default:
							return false;
					}
				} else if (typeof stateValue === 'string') {
					switch (condition.comparisonOperator) {
						case WorkflowComparisonOperator.EQUAL:
							return stateValue === condition.value;
						case WorkflowComparisonOperator.NOT_EQUAL:
							return stateValue !== condition.value;
						case WorkflowComparisonOperator.CONTAINS:
							return stateValue.includes(condition.value);
						case WorkflowComparisonOperator.NOT_CONTAINS:
							return !stateValue.includes(condition.value);
						case WorkflowComparisonOperator.STARTS_WITH:
							return stateValue.startsWith(condition.value);
						case WorkflowComparisonOperator.ENDS_WITH:
							return stateValue.endsWith(condition.value);
						case WorkflowComparisonOperator.EMPTY:
							return stateValue == null
						case WorkflowComparisonOperator.NOT_EMPTY:
							return stateValue != null
						default:
							return false;
					}
				} else {
					switch (condition.comparisonOperator) {
						case WorkflowComparisonOperator.EMPTY:
							return isEmpty(stateValue)
						case WorkflowComparisonOperator.NOT_EMPTY:
							return !isEmpty(stateValue)
						default:
							return false
					}
				}
			}

			const evaluateConditions = (conditions: TWFCaseCondition[], logicalOperator: WorkflowLogicalOperator) => {
				if (logicalOperator === WorkflowLogicalOperator.AND) {
					return conditions.every(evaluateCondition);
				} else if (logicalOperator === WorkflowLogicalOperator.OR) {
					return conditions.some(evaluateCondition);
				}
				return false;
			}

			for (const item of entity.cases) {
				const result = evaluateConditions(item.conditions, item.logicalOperator)
				if (result) {
					// Handle the case where conditions are met
					// For example, you might want to return a specific state or perform an action
					return node.key + '/' + item.caseId
				}
			}
			return node.key + '/else'
		}

		workflowNode = async (state: typeof AgentStateAnnotation.State, config) => {
			const result = evaluateCases(state, config)
			return graph.connections.find((conn) =>conn.type === 'edge' && conn.from === result)?.to
		}
	}

	return {
		workflowNode,
		nextNodes: graph.connections
			.filter((_) => _.type === 'edge' && _.from.startsWith(node.key))
			.map((conn) => graph.nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to))
	}
}
