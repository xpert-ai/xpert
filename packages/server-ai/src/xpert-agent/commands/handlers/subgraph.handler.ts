import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { BaseMessage, HumanMessage, isAIMessage, ToolMessage } from '@langchain/core/messages'
import { HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
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
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, convertToUrlPath, IXpert, IXpertAgent, IXpertAgentExecution, TStateVariable, TSummarize, TXpertTeamNode, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'
import z from 'zod'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { memoryPrompt } from '../../../copilot-store/utils'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertWorkflowQuery, GetXpertChatModelQuery } from '../../../xpert/queries'
import { createParameters } from '../execute.command'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { ToolNode } from './tool_node'
import { AgentStateAnnotation, parseXmlString, stateVariable, TGraphTool, TSubAgent } from './types'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'

@CommandHandler(XpertAgentSubgraphCommand)
export class XpertAgentSubgraphHandler implements ICommandHandler<XpertAgentSubgraphCommand> {
	readonly #logger = new Logger(XpertAgentSubgraphHandler.name)

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentSubgraphCommand): Promise<{graph: CompiledStateGraph<unknown, unknown, any>; nextNodes: TXpertTeamNode[]}> {
		const { agentKey, xpert, options } = command
		const { isStart, execution, leaderKey, summarizeTitle, subscriber, abortController } = options

		const {agent, next} = await this.queryBus.execute<GetXpertWorkflowQuery, {agent: IXpertAgent; next: TXpertTeamNode[]}>(
			new GetXpertWorkflowQuery(xpert.id, agentKey, command.options?.isDraft)
		)
		if (!agent) {
			throw new NotFoundException(
				`Xpert agent not found for '${xpert.name}' and key ${agentKey} draft is ${command.options?.isDraft}`
			)
		}

		console.log(next)

		// The xpert (agent team)
		const team = agent.team

		// LLM
		const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
			new GetXpertChatModelQuery(agent.team, agent, {
				abortController,
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
					isTool: true
				})

				subAgents[item.name] = item
				if (team.agentConfig?.interruptBefore?.includes(item.name)) {
					interruptBefore.push(item.name)
				}
			}
		}

		const summarize = ensureSummarize(team.summarize)
		// Next agent
		let nextNodeKey = END
		const agentKeys = new Set([agent.key])
		const nodes = {}
		const conditionalEdges = {}
		if (isStart) {
			// The root node is responsible for the overall workflow
			const createSubgraph = async (node: TXpertTeamNode, parentKey: string) => {
				if (node.type === 'agent' && !agentKeys.has(node.entity.key)) {
					agentKeys.add(node.key)
					const {stateGraph, nextNodes} = await this.createAgentSubgraph(node.entity, {
						xpert,
						options: {
							leaderKey: parentKey,
							rootExecutionId: command.options.rootExecutionId,
							isDraft: command.options.isDraft,
							subscriber
						},
						isTool: false
					})
	
					nodes[node.entity.key] = stateGraph
					conditionalEdges[parentKey] = createAgentNavigator(summarize, false, node.entity.key)

					for await (const nNode of nextNodes ?? []) {
						await createSubgraph(nNode, node.key)
					}
				}
			}
			for await (const node of next ?? []) {
				await createSubgraph(node, agentKey)
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
					...(variable.reducer ? stateVariable(variable) : {
						reducer: variable.reducer,
						default: variable.default,
					}),
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
			]))
		})

		const chatModelWithTools = chatModel.bindTools([...tools.map((item) => item.tool), ...Object.keys(subAgents ?? {}).map((name) => subAgents[name].tool)])

		const enableMessageHistory = !agent.options?.disableMessageHistory
		const stateModifier = async (state: typeof AgentStateAnnotation.State) => {
			const { summary, memories } = state
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

			const messages: BaseMessage[] = [systemMessage]
			if (enableMessageHistory && state[`${agentKey}.messages`]) {
				messages.push(...state[`${agentKey}.messages`])
			}

			if (agent.promptTemplates) {
				const humanMessages = await Promise.all(
					agent.promptTemplates.map((temp) =>
						HumanMessagePromptTemplate.fromTemplate(temp.text, {
							templateFormat: 'mustache'
						}).format(parameters)
					)
				)
				messages.push(...humanMessages)
			}
			return messages
		}

		const callModel = async (state: typeof SubgraphStateAnnotation.State, config?: RunnableConfig) => {
			const message = await chatModelWithTools.invoke(await stateModifier(state), config)
			return {
				messages: [message],
				[`${agentKey}.messages`]: [message]
			}
		}

		const thread_id = command.options.thread_id
		const subgraphBuilder = new StateGraph(SubgraphStateAnnotation)
			.addNode(
				agentKey,
				new RunnableLambda({ func: callModel }).withConfig({ runName: agentKey, tags: [thread_id] })
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

		if (!Object.keys(nodes).length) {
			subgraphBuilder.addConditionalEdges(agentKey, createAgentNavigator(summarize, false,))
		} else {
			// Next nodes
			Object.keys(nodes).forEach((name) => subgraphBuilder.addNode(name, nodes[name]))
			Object.keys(conditionalEdges).forEach((name) => subgraphBuilder.addConditionalEdges(name, conditionalEdges[name]))
		}

		return {
			graph: subgraphBuilder.compile({
				checkpointer: this.copilotCheckpointSaver,
				interruptBefore: []
			}),
			nextNodes: next
		}
	}

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
			isTool: boolean
		}
	) {
		const { xpert, options, isTool } = config
		const { subscriber, leaderKey } = options
		const execution: IXpertAgentExecution = {}

		// Subgraph
		const {graph, nextNodes} = await this.commandBus.execute(
			new XpertAgentSubgraphCommand(agent.key, xpert, {
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

		return {
			name: uniqueName,
			tool: agentTool,
			nextNodes,
			stateGraph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config: LangGraphRunnableConfig): Promise<Partial<typeof AgentStateAnnotation.State>> => {
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
				const finalize = async (configurable) => {
					const timeEnd = Date.now()
					// Record End time
					const newExecution = await this.commandBus.execute(
						new XpertAgentExecutionUpsertCommand({
							..._execution,
							checkpointId: configurable.checkpoint_id,
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
					const output = await graph.invoke(subState, config)

					const _state = await graph.getState(config)

					// End agent execution event
					await finalize(_state.config.configurable)

					const lastMessage = output.messages[output.messages.length - 1]
					return isTool ? {
						[`${leaderKey}.messages`]: [
							new ToolMessage({
								content: lastMessage.content,
								name: call.name,
								tool_call_id: call.id ?? "",
							})
						],
						[`${agent.key}.messages`]: [lastMessage]
					} : {
						[`${agent.key}.messages`]: [lastMessage]
					}
				} catch(err) {
					console.error(err)
					// Catch the error before generated obs
					// try {
					// 	status = XpertAgentExecutionStatusEnum.ERROR
					// 	error = getErrorMessage(err)
					// 	await finalize()
					// } catch(err) {
					// 	//
					// }
					// throw err
				}
			}),
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

function createAgentNavigator(summarize, summarizeTitle, next?: string) {
	return (state: typeof AgentStateAnnotation.State) => {
		const { title, messages } = state
		const lastMessage = messages[messages.length - 1]
		if (isAIMessage(lastMessage)) {
			if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
				// If there are more than six messages, then we summarize the conversation
				if (summarize?.enabled && messages.length > summarize.maxMessages) {
					return 'summarize_conversation'
				} else if (!title && summarizeTitle) {
					return 'title_conversation'
				}

				return next ?? END
			}

			return lastMessage.tool_calls.map((toolCall) => new Send(toolCall.name, { ...state, toolCall }))
		}

		return next ?? END
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