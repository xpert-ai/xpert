import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, isAIMessage, isAIMessageChunk, isBaseMessage, isBaseMessageChunk, isToolMessage, RemoveMessage, ToolMessage } from '@langchain/core/messages'
import { HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { Runnable, RunnableConfig, RunnableLambda, RunnableLike } from '@langchain/core/runnables'
import {
	Annotation,
	Command,
	CompiledStateGraph,
	END,
	LangGraphRunnableConfig,
	messagesStateReducer,
	Send,
	START,
	StateGraph
} from '@langchain/langgraph'
import { agentLabel, agentUniqueName, channelName, ChatMessageEventTypeEnum, IXpert, IXpertAgent, IXpertAgentExecution, mapTranslationLanguage, STATE_VARIABLE_SYS, TMessageChannel, TStateVariable, TSummarize, TXpertAgentExecution, TXpertGraph, TXpertParameter, TXpertTeamNode, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { Subscriber } from 'rxjs'
import z from 'zod'
import { v4 as uuidv4 } from "uuid"
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { memoryPrompt } from '../../../copilot-store/utils'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertWorkflowQuery, GetXpertChatModelQuery } from '../../../xpert/queries'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { ToolNode } from './tool_node'
import { AgentStateAnnotation, allAgentsKey, identifyAgent, parseXmlString, STATE_VARIABLE_TITLE_CHANNEL, stateToParameters, stateVariable, TGraphTool, TSubAgent } from './types'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { createSummarizeAgent } from './react_agent_executor'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { EnsembleRetriever } from 'langchain/retrievers/ensemble'
import { ChatOpenAI } from '@langchain/openai'
import { XpertConfigException } from '../../../core/errors'
import { RequestContext } from '@metad/server-core'
import { FakeStreamingChatModel, getChannelState, messageEvent, TStateChannel } from '../../agent'
import { stringifyMessageContent } from '@metad/copilot'
import { createParameters } from '../../workflow/parameter'
import { CreateWorkflowNodeCommand } from '../create-workflow.command'


@CommandHandler(XpertAgentSubgraphCommand)
export class XpertAgentSubgraphHandler implements ICommandHandler<XpertAgentSubgraphCommand> {
	readonly #logger = new Logger(XpertAgentSubgraphHandler.name)

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: XpertAgentSubgraphCommand): Promise<{
		agent: IXpertAgent; 
		graph: CompiledStateGraph<unknown, unknown, any>;
		nextNodes: TXpertTeamNode[];
		failNode: TXpertTeamNode
	}> {
		const { agentKeyOrName, xpert, options } = command
		const { isStart, execution, leaderKey, channel: agentChannel, summarizeTitle, subscriber, rootController, signal, disableCheckpointer, variables, partners, handoffTools } = options

		// Signal controller in this subgraph
		const abortController = new AbortController()
		signal?.addEventListener('abort', () => abortController.abort())

		const {agent, graph, next, fail} = await this.queryBus.execute<GetXpertWorkflowQuery, {agent: IXpertAgent; graph: TXpertGraph; next: TXpertTeamNode[]; fail: TXpertTeamNode[]}>(
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
		// const agentChannel = channelName(agent.key)
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
		if (!copilotModel.copilot) {
			throw new XpertConfigException(await this.i18nService.t('xpert.Error.CopilotModelConfigError', {lang: mapTranslationLanguage(RequestContext.getLanguageCode()), args: {model: copilotModel.model}}))
		}
		execution.metadata = {
			provider: copilotModel.copilot.modelProvider?.providerName,
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model
		}

		// Create tools
		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
			new ToolsetGetToolsCommand(options?.toolsets ?? agent.toolsetIds, {
				xpertId: xpert.id,
				agentKey,
				signal: abortController.signal
			})
		)
		abortController.signal.addEventListener('abort', () => {
			for (const toolset of toolsets) {
				toolset.close().catch((err) => this.#logger.debug(err))
			}
		})
		const tools: TGraphTool[] = []
		const interruptBefore: string[] = []
		const toolsetVarirables: TStateVariable[] = []
		const stateVariables: TStateVariable[] = Array.from(team.agentConfig?.stateVariables ?? [])
		for await (const toolset of toolsets) {
			toolsetVarirables.push(...(toolset.getVariables() ?? []))
			stateVariables.push(...toolsetVarirables)
			const items = await toolset.initTools()
			// Filter available tools by agent
			const availableTools = agent.options?.availableTools?.[toolset.getToolset().name] ?? []
			items.filter((tool) => availableTools.length ? availableTools.includes(tool.name) : true)
			  .forEach((tool) => {
				const lc_name = get_lc_unique_name(tool.constructor as typeof Serializable)
				tools.push({ caller: agent.key, tool, variables: team.agentConfig?.toolsMemory?.[lc_name] })

				// Add sensitive tools into interruptBefore
				if (team.agentConfig?.interruptBefore?.includes(lc_name)) {
					interruptBefore.push(tool.name)
				}
			})
		}

		this.#logger.debug(`Use tools:\n${[...tools].map((_, i) => `${i+1}. ` + _.tool.name + ': ' + _.tool.description).join('\n')}`)

		// Knowledgebases
		const knowledgebaseIds = options?.knowledgebases ?? agent.knowledgebaseIds
		if (knowledgebaseIds?.length) {
			const recalls = team.agentConfig?.recalls
			const recall = agent.options?.recall
			const retrievers = knowledgebaseIds.map((id) => ({
				retriever: createKnowledgeRetriever(this.queryBus, id, {...(recalls?.[id] ?? {}), ...(recall ?? {})}),
				weight: recalls?.[id]?.weight
			}))
			const retriever = new EnsembleRetriever({
				retrievers: retrievers.map(({retriever}) => retriever),
				weights: retrievers.map(({weight}) => weight ?? 0.5),
			  })
			tools.push({
				caller: agent.key,
				tool: retriever.asTool({
					name: "knowledge_retriever",
					description: "Get knowledges about question.",
					schema: z.string().describe(`key information of question`),
				  })
			})
		}

		// Sub agents
		const subAgents: Record<string, TSubAgent> = {}
		if (agent.followers?.length) {
			this.#logger.debug(`Use sub agents:\n ${agent.followers.map((_) => _.name)}`)
			for await (const follower of agent.followers) {
				if (partners?.includes(follower.key)) {
					continue
				}
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
					isTool: true,
					partners
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
					isTool: true,
					partners
				})
				
				subAgents[item.name] = item
				if (team.agentConfig?.interruptBefore?.includes(item.name)) {
					interruptBefore.push(item.name)
				}
			}
		}

		const withTools = [...tools.map((item) => item.tool), ...Object.keys(subAgents ?? {}).map((name) => subAgents[name].tool), ...(handoffTools ?? [])]
		const summarize = ensureSummarize(team.summarize)
		// Next agent
		let nextNodeKey: string[] = []
		let failNodeKey = END
		const agentKeys = new Set([agent.key])
		const nodes: Record<string, {ends: string[]; graph: Runnable;}> = {}
		// Conditional Edges
		const conditionalEdges: Record<string, [RunnableLike, string[]?]> = {}
		// Fixed Edge
		const edges: Record<string, string> = {}
		// Channels of workflow
		const channels: TStateChannel[] = []
		if (isStart) {
			/**
			 * The root node is responsible for the overall workflow
			 * 
			 * @param node next node
			 * @param node fail node
			 * @param parentKey The pre-node of this node
			 * @param isPrimary is the root agent call
			 * @param nexts Nexts nodes of primary agent call
			 * @returns 
			 */
			const createSubgraph = async (node: TXpertTeamNode, fail: TXpertTeamNode, parentKey?: string) => {
				if (node?.type === 'agent') {
					if (agentKeys.has(node.key)) {
						return
					}
					agentKeys.add(node.key)
					// Is sensitive node
					if (team.agentConfig?.interruptBefore?.includes(agentUniqueName(node.entity))) {
						interruptBefore.push(node.key)
					}
					const {stateGraph, nextNodes, failNode} = await this.createAgentSubgraph(node.entity, {
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
						isTool: false,
						variables: toolsetVarirables,
						partners
					})
					
					// Conditional Edges
					const ends = []
					if (failNode) {
						ends.push(failNode.key)
					}
					// if (nextNodes?.[0]) {
					// 	ends.push(nextNodes[0].key)
					// }
					nodes[node.key] = {graph: stateGraph, ends}

					// Fixed Edge
					if (nextNodes?.[0]?.key) {
						edges[node.key] = nextNodes[0].key
					}

					if (nextNodes?.length || failNode) {
						await createSubgraph(nextNodes?.[0], failNode)
					}
				} else if(node?.type === 'workflow') {
					const { workflowNode, navigator, nextNodes, channel } = await this.commandBus.execute(
						new CreateWorkflowNodeCommand(xpert.id, graph, node, parentKey, {
							isDraft: options.isDraft,
							subscriber,
							rootExecutionId: options.rootExecutionId
						}))
					if (channel) {
						channels.push(channel)
					}
					nodes[node.key] = {
						...workflowNode
					}
					conditionalEdges[node.key] = [navigator, [...nextNodes.map((n) => n.key), END] ]
					for await (const nNode of nextNodes ?? []) {
						await createSubgraph(nNode, null)
					}
				}

				if (fail && !agentKeys.has(fail.key) && fail.type === 'agent') {
					agentKeys.add(fail.key)
					const {stateGraph, nextNodes, failNode} = await this.createAgentSubgraph(fail.entity, {
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
						isTool: false,
						variables: toolsetVarirables,
						partners
					})
	
					nodes[fail.key] = {graph: stateGraph, ends: []}
					if (nextNodes?.length || failNode) {
						await createSubgraph(nextNodes?.[0], failNode)
					}
				}
			}

			if (next?.length || fail?.length) {
				const pathMap = [...withTools.map((tool) => tool.name)]
				for await (const nextNode of next) {
					await createSubgraph(nextNode, fail?.[0], agentKey)
					pathMap.push(nextNode.key)
				}
				
				nextNodeKey = next?.map((n) => n.key)
				if (nextNodeKey?.some((_) => !_)) {
					console.error(`There is an empty nextNodeKey in Agent`)
				}
				if (fail?.length) {
					failNodeKey = fail?.[0]?.key
				}
				if (fail?.length) {
					pathMap.push(fail?.[0]?.key)
				}
				if (summarizeTitle) {
					pathMap.push('title_conversation')
				}
				conditionalEdges[agentKey] = [
					createAgentNavigator(channelName(agentKey), summarize, summarizeTitle, next?.map((n) => n.key)),
					pathMap
				]
			}
		}
		if (leaderKey) {
			agentKeys.add(leaderKey)
		}

		// State
		const agents = allAgentsKey(graph)
		const SubgraphStateAnnotation = Annotation.Root({
			// Temp parameters
			...(variables?.reduce((state, schema) => {
				state[schema.name] = Annotation(stateVariable(schema))
				return state
			}, {}) ?? {}),
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
			...(agent.parameters?.reduce((acc, parameter) => {
				acc[parameter.name] = Annotation(stateVariable(parameter))
				return acc
			}, {}) ?? {}),
			// Channels for workflow nodes
			...channels.reduce((state, channel) => {
				state[channel.name] = channel.annotation
				return state
			}, {}),
			// Channels for agents
			...Object.fromEntries(agents.map((agent) => [
				channelName(agent.key),
				Annotation<{messages: BaseMessage[]} & Record<string, unknown>>({
					reducer: (a, b) => {
						return b ? {
							...a,
							...b,
							messages: b.messages ? messagesStateReducer(a.messages, b.messages) : a.messages
						} : a
					},
					default: () => ({
						agent: identifyAgent(agent),
						messages: []})
				})
			])),
		})

		const enableMessageHistory = !agent.options?.disableMessageHistory
		const stateModifier = async (state: typeof AgentStateAnnotation.State) => {
			const { memories } = state
			const summary = getChannelState(state, agentChannel)?.summary
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

			const humanMessages: HumanMessage[] = []
			const messageHistory = getChannelState(state, agentChannel)?.messages ?? []
			// Determine whether it is Agent reflection (last message is ToolMessage)
			if (!(isBaseMessage(messageHistory[messageHistory.length - 1])
				&& isToolMessage(messageHistory[messageHistory.length - 1]))) {
				// Is new human input: use message templates or input message
				const humanTemplates = agent.promptTemplates?.filter((_) => !!_.text?.trim())
				if (humanTemplates?.length) {
					for await (const temp of humanTemplates) {
						humanMessages.push(await HumanMessagePromptTemplate.fromTemplate(temp.text, {
							templateFormat: 'mustache'
						}).format(parameters))
					}
				}
				if (!humanMessages.length && state.input) {
					humanMessages.push(new HumanMessage(state.input))
				}
			}

			return {
				systemMessage,
				messageHistory,
				humanMessages
			}
		}
		
		// Fill tools or structured output into chatModel
		const withStructured = (chatModel) => {
			let chatModelWithTools = null
			if (withTools.length) {
				if (agent.options?.parallelToolCalls === false && chatModel instanceof ChatOpenAI) {
					chatModelWithTools = chatModel.bindTools(withTools, {parallel_tool_calls: false})
				} else {
					chatModelWithTools = chatModel.bindTools(withTools)
				}
			} else {
				chatModelWithTools = agent.outputVariables?.length ? chatModel.withStructuredOutput(z.object({
					...createParameters(agent.outputVariables),
				})) : chatModel
			}
			return chatModelWithTools
		}
		// Execute agent
		const callModel = async (state: typeof SubgraphStateAnnotation.State, config?: RunnableConfig) => {
			const structuredChatModel = withStructured(chatModel)
			let withFallbackModel: Runnable = structuredChatModel
			if (agent.options?.retry?.enabled) {
				withFallbackModel = withFallbackModel.withRetry({stopAfterAttempt: agent.options.retry.stopAfterAttempt ?? 2})
			}
			// Fallback model
			if (agent.options?.fallback?.enabled) {
				if (!agent.options?.fallback?.copilotModel?.model) {
					throw new XpertConfigException(await this.i18nService.translate('xpert.Error.FallbackModelNotFound',
						{
							lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
							args: {
								agent: agentLabel(agent)
							}
						}))
				}
				let fallbackChatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
					new GetXpertChatModelQuery(agent.team, null, {
						copilotModel: agent.options.fallback.copilotModel,
						abortController: rootController,
						usageCallback: assignExecutionUsage(execution)
					})
				)
				fallbackChatModel = withStructured(fallbackChatModel)
				withFallbackModel = withFallbackModel.withFallbacks([fallbackChatModel])
			}

			// Error handling
			const errorHandling = agent.options?.errorHandling
			if (errorHandling?.type === 'defaultValue') {
				withFallbackModel = withFallbackModel.withFallbacks([
					new FakeStreamingChatModel({responses: [new AIMessage(errorHandling.defaultValue?.content)]})
				])
			}

			const {systemMessage, messageHistory, humanMessages} = await stateModifier(state)
			// Disable history and new human request then remove history
			const deleteMessages = (!enableMessageHistory && humanMessages.length) ? messageHistory.map((m) => new RemoveMessage({ id: m.id as string })) : []
			try {
				const message = await withFallbackModel.invoke([
					systemMessage, ...((enableMessageHistory || !humanMessages.length) ? messageHistory : []), ...humanMessages
				], {...config, signal: abortController.signal})

				const messages = [...deleteMessages, ...humanMessages]
				const nState: Record<string, any> = {
					// [STATE_VARIABLE_INPUT]: '',
					messages: messages,
					[channelName(agentKey)]: {messages}
				}
				if ((isBaseMessage(message) && isAIMessage(message))
					|| isBaseMessageChunk(message) && isAIMessageChunk(message)) {
					nState.messages.push(message)
					nState[channelName(agentKey)].messages.push(message)
					nState[channelName(agentKey)].output = stringifyMessageContent(message.content)
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
			} catch(err) {
				if(errorHandling?.type === 'failBranch') {
					return new Command({
						goto: failNodeKey,
						update: {
							messages: [...deleteMessages, new AIMessage(`Error: ${getErrorMessage(err)}`)],
							[channelName(agentKey)]: {messages: [...deleteMessages, new AIMessage(`Error: ${getErrorMessage(err)}`)]}
						}
					})
				}
				throw err
			}
		}

		const subgraphBuilder = new StateGraph(SubgraphStateAnnotation)
			.addNode(agentKey, new RunnableLambda({ func: callModel })
					.withConfig({ runName: agentKey, tags: [thread_id, xpert.id, agentKey] })
				)
			.addEdge(START, agentKey)

		// Add nodes for tools
		const endNodes = team.agentConfig?.endNodes
		tools?.forEach(({ caller, tool, variables }) => {
			const name = tool.name
			subgraphBuilder
				.addNode(name, new ToolNode([tool], { caller, variables }).withConfig({signal: abortController.signal}))
			if (endNodes?.includes(tool.name)) {
				if (nextNodeKey?.length) {
					if (nextNodeKey.some((_) => !_)) {
						throw new InternalServerErrorException(`There is an empty nextNodeKey in tools`)
					}
					subgraphBuilder.addConditionalEdges(name, (state, config) => {
						return nextNodeKey.filter((_) => !!_).map((n) => new Send(n, state))
					})
				} else {
					subgraphBuilder.addEdge(name, END)
				}
			} else {
				subgraphBuilder.addEdge(name, agentKey)
			}
		})

		handoffTools?.forEach((tool) => {
			const name = tool.name
			subgraphBuilder
				.addNode(name, new ToolNode([tool], { caller: '' }).withConfig({signal: abortController.signal}))
		})

		// Subgraphs
		if (subAgents) {
			Object.keys(subAgents).forEach((name) => {
				subgraphBuilder.addNode(name, subAgents[name].stateGraph)

				if (endNodes?.includes(name)) {
					if (nextNodeKey?.length) {
						if (nextNodeKey.some((_) => !_)) {
							throw new InternalServerErrorException(`There is an empty nextNodeKey in tools`)
						}
						subgraphBuilder.addConditionalEdges(name, (state, config) => {
							return nextNodeKey.filter((_) => !!_).map((n) => new Send(n, state))
						})
					} else {
						subgraphBuilder.addEdge(name, END)
					}
				} else {
					subgraphBuilder.addEdge(name, agentKey)
				}
			})
		}

		if (summarizeTitle) {
			subgraphBuilder.addNode("title_conversation", await this.createTitleAgent(team, {
					rootController,
					rootExecutionId: command.options.rootExecutionId,
					agentKey,
				}))
				.addEdge("title_conversation", END)
		}
		if (summarize?.enabled) {
			subgraphBuilder.addNode("summarize_conversation", createSummarizeAgent(chatModel, summarize, agentKey))
				.addEdge("summarize_conversation", END)
		}

		if (!Object.keys(nodes).length) {
			subgraphBuilder.addConditionalEdges(agentKey, createAgentNavigator(agentChannel, summarize, summarizeTitle))
		} else {
			// Next nodes
			Object.keys(nodes).forEach((name) => subgraphBuilder.addNode(name, nodes[name].graph.withConfig({signal: abortController.signal}), {ends: nodes[name].ends}))
			Object.keys(edges).forEach((name) => subgraphBuilder.addEdge(name, edges[name]))
			Object.keys(conditionalEdges).forEach((name) => subgraphBuilder.addConditionalEdges(name, conditionalEdges[name][0], conditionalEdges[name][1]))
		}

		return {
			agent,
			graph: subgraphBuilder.compile({
				checkpointer: disableCheckpointer ? false : this.copilotCheckpointSaver,
				interruptBefore,
				name: agentKey
			}),
			nextNodes: next,
			failNode: fail?.[0],
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
			/**
			 * Temporary parameters (state variables)
			 */
			variables?: TXpertParameter[],
			partners: string[]
		}
	) {
		const { xpert, options, isTool, thread_id, rootController, signal, variables, partners } = config
		const { subscriber, leaderKey } = options
		const execution: IXpertAgentExecution = {}

		// Subgraph
		const {graph, nextNodes, failNode} = await this.commandBus.execute<XpertAgentSubgraphCommand, {
			graph: CompiledStateGraph<unknown, unknown>; nextNodes: TXpertTeamNode[]; failNode: TXpertTeamNode}>(
			new XpertAgentSubgraphCommand(agent.key, xpert, {
				thread_id,
				rootController,
				signal,
				isStart: isTool,
				leaderKey,
				rootExecutionId: config.options.rootExecutionId,
				isDraft: config.options.isDraft,
				subscriber,
				execution,
				variables,
				channel: channelName(agent.key),
				partners
			})
		)

		const uniqueName = agentUniqueName(agent)
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

			// Record start time
			const timeStart = Date.now()
			const _execution = await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...execution,
					threadId: config.configurable.thread_id,
					checkpointNs: config.configurable.checkpoint_ns,
					xpert: { id: xpert.id } as IXpert,
					agentKey: agent.key,
					inputs: call?.args,
					parentId: options.rootExecutionId,
					status: XpertAgentExecutionStatusEnum.RUNNING
				})
			)

			// Start agent execution event
			subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_START, _execution))

			let status = XpertAgentExecutionStatusEnum.SUCCESS
			let error = null
			let result = ''
			const finalize = async () => {
				const _state = await graph.getState(config)

				const timeEnd = Date.now()
				// Record End time
				const newExecution = await this.commandBus.execute(
					new XpertAgentExecutionUpsertCommand({
						...execution,
						id: _execution.id,
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
				subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_END, fullExecution))
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

				const nState: Record<string, any> = isTool ? {
					messages: [
						new ToolMessage({
							content: lastMessage.content,
							name: call.name,
							tool_call_id: call.id ?? "",
						})
					],
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
						...output[channelName(agent.key)],
						messages: [lastMessage]
					}
				} : {
					messages: [lastMessage],
					[channelName(agent.key)]: {
						...output[channelName(agent.key)],
						messages: [lastMessage],
						output: stringifyMessageContent(lastMessage.content)
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
				
				throw err
			} finally {
				// End agent execution event
				await finalize()
			}
		})

		return {
			name: uniqueName,
			tool: agentTool,
			nextNodes,
			failNode,
			stateGraph
		} as TSubAgent
	}

	async createTitleAgent(xpert: IXpert, options: {rootController: AbortController; rootExecutionId: string; agentKey?: string;}) {
		const {rootController, rootExecutionId, agentKey} = options
		const execution = {} as TXpertAgentExecution
		const copilotModel = xpert.copilotModel
		execution.metadata = {
			provider: copilotModel.copilot.modelProvider?.providerName,
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model
		}
		const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
			new GetXpertChatModelQuery(xpert, null, {
				copilotModel: copilotModel,
				abortController: rootController,
				usageCallback: assignExecutionUsage(execution)
			})
		)
		
		return async (state: typeof AgentStateAnnotation.State, config: RunnableConfig): Promise<Partial<typeof AgentStateAnnotation.State>> => {
			// Record start time
			const timeStart = Date.now()
			let status = XpertAgentExecutionStatusEnum.SUCCESS
			let error = null
			let result = null
			const _execution = await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...execution,
					xpert: { id: xpert.id } as IXpert,
					parentId: rootExecutionId,
					status: XpertAgentExecutionStatusEnum.RUNNING,
					channelName: STATE_VARIABLE_TITLE_CHANNEL
				})
			)

			try {
				// Title the conversation
				const messages = (<TMessageChannel>state[channelName(agentKey)]).messages
				const language = state[STATE_VARIABLE_SYS]?.language
			
				const allMessages = [...messages, new HumanMessage({
					id: uuidv4(),
					content: `Create a short title${language ? ` in language '${language}'` : ''} for the conversation above, without adding any extra phrases like 'Conversation Title:':`,
				})]
				const response = await chatModel.invoke(allMessages, {tags: ['title_conversation']});
				result = response.content
				if (typeof response.content !== "string") {
					throw new Error("Expected a string response from the model");
				}
				
				return {
					title: response.content.replace(/^"/g, '').replace(/"$/g, ''),
					[STATE_VARIABLE_TITLE_CHANNEL]: {
						messages: [...allMessages, response]
					}
				}
			} catch (err) {
				error = getErrorMessage(err)
				status = XpertAgentExecutionStatusEnum.ERROR
			} finally {
				const timeEnd = Date.now()
				// Record End time
				await this.commandBus.execute(
					new XpertAgentExecutionUpsertCommand({
						..._execution,
						threadId: config.configurable.thread_id,
						checkpointId: config.configurable.checkpoint_id,
						checkpointNs: '',
						elapsedTime: timeEnd - timeStart,
						status,
						error,
						outputs: {
							output: result
						}
					})
				)
			}
		}
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

/**
 * Create conditionalEdges function for agent
 * 
 * @param agentChannel 
 * @param summarize 
 * @param summarizeTitle 
 * @param nextNodes 
 * @returns conditionalEdgesFun
 */
function createAgentNavigator(agentChannel: string, summarize: TSummarize, summarizeTitle: boolean, nextNodes?: (string[] | ((state, config) => string))) {
	return (state: typeof AgentStateAnnotation.State, config) => {
		const { title } = state
		const messages = getChannelState(state, agentChannel)?.messages ?? []
		const lastMessage = messages[messages.length - 1]
		if (isBaseMessage(lastMessage) && isAIMessage(lastMessage)) {
			if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
				const nexts: Send[] = []
				// If there are more than six messages, then we summarize the conversation
				if (summarize?.enabled && messages.length > summarize.maxMessages) {
					nexts.push(new Send("summarize_conversation", state))
				} else if (!title && summarizeTitle) {
					nexts.push(new Send("title_conversation", state))
				}

				if (nextNodes) {
					if (Array.isArray(nextNodes)) {
						if (nextNodes.some((_) => !_)) {
							throw new InternalServerErrorException(`There is an empty nextNodes in createAgentNavigator`)
						}
						nexts.push(...nextNodes.filter((_) => !!_).map((name) => new Send(name, state)))
					} else {
						nexts.push(new Send(nextNodes(state, config), state))
					}
				}

				if (nexts.length) {
					return nexts
				}

				return END
			}

			return lastMessage.tool_calls.map((toolCall) => {
				if (!toolCall.name) {
					throw new InternalServerErrorException(`tool_call's name is empty in '${agentChannel}'.`)
				}
				return new Send(toolCall.name, { ...state, toolCall })
			})
		}

		if (nextNodes) {
			if (Array.isArray(nextNodes)) {
				return nextNodes.map((name) => new Send(name, state))
			} else {
				return new Send(nextNodes(state, config), state)
			}
		}

		return END
	}
}
