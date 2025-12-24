import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { AIMessage, BaseMessage, HumanMessage, isAIMessage, isBaseMessage, isBaseMessageChunk, isToolMessage, RemoveMessage, ToolMessage } from '@langchain/core/messages'
import { HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { Runnable, RunnableConfig, RunnableLambda, RunnableLike } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import {
	Annotation,
	END,
	LangGraphRunnableConfig,
	MessagesAnnotation,
	messagesStateReducer,
	Send,
	START,
	StateGraph
} from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { agentLabel, agentUniqueName, allChannels, channelName, ChatMessageEventTypeEnum, findStartNodes, getAgentMiddlewareNodes, getCurrentGraph, getWorkflowTriggers, GRAPH_NODE_SUMMARIZE_CONVERSATION, GRAPH_NODE_TITLE_CONVERSATION, isAgentKey, IWFNAgentTool, IXpert, IXpertAgent, IXpertAgentExecution, KnowledgebaseChannel, mapTranslationLanguage, STATE_VARIABLE_HUMAN, TAgentRunnableConfigurable, TStateVariable, TSummarize, TXpertGraph, TXpertParameter, TXpertTeamNode, WorkflowNodeTypeEnum, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { stringifyMessageContent } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Inject, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { AfterModelHandler, AgentBuiltInState, AgentMiddleware, AgentMiddlewareRegistry, BeforeModelHandler, ModelRequest, WrapModelCallHandler, WrapToolCallHook } from '@xpert-ai/plugin-sdk'
import { get, isNil, omitBy, uniq } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { Subscriber } from 'rxjs'
import { t } from 'i18next'
import z from 'zod'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertWorkflowQuery, GetXpertChatModelQuery, TXpertWorkflowQueryOutput } from '../../../xpert/queries'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { ToolNode } from './tool_node'
import { parseXmlString } from './types'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { XpertConfigException } from '../../../core/errors'
import { FakeStreamingChatModel, getChannelState, messageEvent, TAgentSubgraphParams, TAgentSubgraphResult } from '../../agent'
import { initializeMemoryTools, formatMemories } from '../../../copilot-store'
import { CreateWorkflowNodeCommand, createWorkflowTaskTools } from '../../workflow'
import { toEnvState } from '../../../environment'
import { _BaseToolset, ToolSchemaParser, AgentStateAnnotation, createHumanMessage, stateToParameters, createSummarizeAgent, translate, stateVariable, identifyAgent, createParameters, TGraphTool, TSubAgent, TWorkflowGraphNode, TStateChannel, hasMultipleInputs, getAgentMiddlewares, orderNodesByKeyOrder } from '../../../shared'
import { CreateSummarizeTitleAgentCommand } from '../summarize-title.command'
import { XpertCollaborator } from '../../../shared/agent/xpert'
import { AgenticWorkflowTypes } from '../../types'


@CommandHandler(XpertAgentSubgraphCommand)
export class XpertAgentSubgraphHandler implements ICommandHandler<XpertAgentSubgraphCommand> {
	readonly #logger = new Logger(XpertAgentSubgraphHandler.name)

	@Inject(AgentMiddlewareRegistry)
	private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: XpertAgentSubgraphCommand): Promise<TAgentSubgraphResult> {
		const { agentKeyOrName, xpert, options } = command
		const { isStart, execution, leaderKey, channel: agentChannel, summarizeTitle, subscriber, rootController, signal, disableCheckpointer, variables, partners, handoffTools, environment, tools: additionalTools, mute } = options

		// Signal controller in this subgraph
		const abortController = new AbortController()
		signal?.addEventListener('abort', () => abortController.abort())

		const {agent, graph, next, fail} = await this.queryBus.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
			new GetXpertWorkflowQuery(xpert.id, agentKeyOrName, command.options?.isDraft)
		)
		if (!agent) {
			throw new NotFoundException(
				`Xpert agent not found for '${xpert.name}' and key or name '${agentKeyOrName}', draft is ${command.options?.isDraft}`
			)
		}

		// Hidden this agent node: the graph created is a pure workflow starting from start node
		const hiddenAgent = agent.options?.hidden
		// Agent has next nodes or fail node
		const agentHasNextNodes = next?.length || fail?.length

		// The xpert (agent team)
		const team = agent.team
		const agentKey = agent.key
		// const agentChannel = channelName(agent.key)
		const thread_id = command.options.thread_id

		// LLM
		let chatModel: BaseChatModel
		if (!hiddenAgent) {
			chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
				new GetXpertChatModelQuery(agent.team, agent, {
					abortController: rootController,
					usageCallback: assignExecutionUsage(execution)
				})
			)

			// Record ai model info into execution
			const copilotModel = agent.copilotModel ?? team.copilotModel
			if (!copilotModel?.copilot) {
				throw new XpertConfigException(await this.i18nService.t('xpert.Error.CopilotModelConfigError', {lang: mapTranslationLanguage(RequestContext.getLanguageCode()), args: {model: copilotModel.model}}))
			}
			execution.metadata = {
				provider: copilotModel.copilot.modelProvider?.providerName,
				model: copilotModel.model || copilotModel.copilot.copilotModel?.model
			}
		}

		// Create tools
		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, _BaseToolset[]>(
			new ToolsetGetToolsCommand(options?.toolsets ?? agent.toolsetIds, {
				projectId: options.projectId,
				conversationId: options.conversationId,
				xpertId: xpert.id,
				agentKey,
				signal: abortController.signal,
				env: toEnvState(environment),
				store: options.store,
			})
		)
		// Clean all toolsets when aborted
		abortController.signal.addEventListener('abort', () => {
			for (const toolset of toolsets) {
				toolset.close().catch((err) => this.#logger.debug(err))
			}
		})

		const endNodes = team.agentConfig?.endNodes ?? []
		/**
		 * Collection Tools
		 */
		const tools: TGraphTool[] = []
		/**
		 * Collect Agent Tools
		 */
		const workflowTools = []
		const interruptBefore: string[] = []
		const toolsetVarirables: TStateVariable[] = []
		const stateVariables: TStateVariable[] = Array.from(team.agentConfig?.stateVariables ?? [])
		for await (const toolset of toolsets) {
			// Initialize toolset and it's state
			const items = await toolset.initTools()
			const _variables = await toolset.getVariables()
			toolsetVarirables.push(...(_variables ?? []))
			stateVariables.push(...toolsetVarirables)
			// Filter available tools by agent
			const availableTools = agent.options?.availableTools?.[toolset.getName()] ?? []
			items.filter((tool) => availableTools.length ? availableTools.includes(tool.name) : true)
			  .forEach((tool) => {
				const lc_name = tool instanceof DynamicStructuredTool ? tool.name : get_lc_unique_name(tool.constructor as typeof Serializable)
				if (team.agentConfig?.tools?.[lc_name]?.description) {
					tool.description = team.agentConfig.tools[lc_name].description
				}
				tools.push({
					toolset: {
						provider: toolset.providerName,
						id: toolset.getId(),
						title: translate(toolset.getToolTitle(tool.name))
					},
					caller: agent.key, 
					tool, 
					variables: team.agentConfig?.tools?.[lc_name]?.memories || team.agentConfig?.toolsMemory?.[lc_name],
				})

				// Add sensitive tools into interruptBefore
				if (team.agentConfig?.interruptBefore?.includes(lc_name)) {
					interruptBefore.push(tool.name)
				}
			})
		}

		// Workflow Task tool
		const taskTools = await createWorkflowTaskTools(agentKey, graph, {
			environment,
			subscriber,
			isDraft: command.options.isDraft,
			mute: command.options.mute,
			store: command.options.store,
			commandBus: this.commandBus,
			queryBus: this.queryBus,
		})
		tools.push(...taskTools.tools)
		endNodes.push(...taskTools.endNodes)

		// Additional Tools
		if (additionalTools) {
			additionalTools.forEach((tool) => {
				tools.push({ toolset: {provider: '', title: ''}, caller: agent.key, tool })
			})
		}

		// Memory tools
		if (team.memory?.enabled && team.memory?.qa?.enabled) {
			tools.push(...initializeMemoryTools(options.store, xpert.id).map((tool) => ({
				toolset: {
					provider: 'memories',
					title: translate({en_US: 'Memory', zh_Hans: '记忆' })
				},
				caller: agent.key,
				tool,
			})))
		}

		this.#logger.debug(`\nUse tools:\n${tools.length ? tools.map((_, i) => `${i+1}. ` + _.tool.name + ': ' + _.tool.description).join('\n') : 'No tools.'}`)

		// Knowledgebases
		const knowledgebaseIds = options?.knowledgebases ?? agent.knowledgebaseIds
		if (knowledgebaseIds?.length) {
			const recalls = team.agentConfig?.recalls
			const retrievals = team.agentConfig?.retrievals
			const recall = agent.options?.recall
			for (const id of knowledgebaseIds) {
				const retriever = createKnowledgeRetriever(this.queryBus, id, {
					recall: {...(omitBy(recalls?.[id], isNil) ?? {}), ...(omitBy(recall, isNil) ?? {})},
					retrieval: retrievals?.[id]
				})
				tools.push({
					toolset: {
						id: knowledgebaseIds.join(','),
						provider: 'knowledgebase',
						title: translate({en_US: 'Knowledge Retriever', zh_Hans: '知识检索器' })
					},
					caller: agent.key,
					tool: await retriever.toTool({
						name: "retriever-" + id,
					}),
				})
			}
			// const retrievers = knowledgebaseIds.map((id) => ({
			// 	retriever: createKnowledgeRetriever(this.queryBus, id, {
			// 		recall: {...(omitBy(recalls?.[id], isNil) ?? {}), ...(omitBy(recall, isNil) ?? {})},
			// 		retrieval: retrievals?.[id]
			// 	}),
			// 	weight: recalls?.[id]?.weight
			// }))
			// const retriever = new EnsembleRetriever({
			// 	retrievers: retrievers.map(({retriever}) => retriever),
			// 	weights: retrievers.map(({weight}) => weight ?? 0.5),
			//   })
			// tools.push({
			// 	toolset: {
			// 		id: knowledgebaseIds.join(','),
			// 		provider: 'knowledgebase',
			// 		title: translate({en_US: 'Knowledge Retriever', zh_Hans: '知识检索器' })
			// 	},
			// 	caller: agent.key,
			// 	tool: retriever.asTool({
			// 		name: "knowledge_retriever",
			// 		description: "Get knowledges about question.",
			// 		schema: z.string().describe(`key information of question`),
			// 	  }),
			// })
		}

		/**
		 * Sub agents: include followers (agents in one xpert team) and collaborators (external xperts: primary agent is entry)
		 */
		const subAgents: Record<string, TSubAgent> = {}
		if (agent.followers?.length) {
			this.#logger.debug(`\nUse sub agents:\n${agent.followers.map((_, i) => `${i+1}. ` + _.name + ': ' + _.description).join('\n')}`)
			for await (const follower of agent.followers) {
				if (partners?.includes(follower.key)) {
					continue
				}
				const item = await this.createAgentSubgraph(follower, {
					mute: options.mute,
					store: options.store,
					xpert,
					options: {
						leaderKey: agent.key,
						isDraft: command.options.isDraft,
						subscriber
					},
					thread_id,
					rootController,
					signal,
					isTool: true,
					partners,
					isDraft: command.options.isDraft,
					subscriber,
					environment
				})

				subAgents[item.name] = item
				if (team.agentConfig?.interruptBefore?.includes(item.name)) {
					interruptBefore.push(item.name)
				}
			}
		}

		// Collaborators (external xperts)
		if (agent.collaborators?.length) {
			this.#logger.debug(`\nUse xpert collaborators:\n${agent.collaborators.map((_, i) => `${i+1}. ` + _.name + ': ' + _.description).join('\n')}`)
			for await (const collaborator of agent.collaborators) {
				const subAgent = await XpertCollaborator.build({
					xpert: collaborator,
					config: {
						mute: options.mute,
						store: options.store,
						options: {
							leaderKey: agentKey,
							isDraft: false,
							subscriber
						},
						thread_id,
						rootController,
						signal,
						partners,
						isDraft: command.options.isDraft,
						subscriber,
						environment
					},
					commandBus: this.commandBus,
					queryBus: this.queryBus
				})
				
				subAgents[subAgent.name] = subAgent
				if (team.agentConfig?.interruptBefore?.includes(subAgent.name)) {
					interruptBefore.push(subAgent.name)
				}
				// Collect mute config for external xpert
				if (collaborator.agentConfig?.mute?.length) {
					mute.push(...collaborator.agentConfig.mute.map((_) => [collaborator.id, ..._]))
				}
			}
		}

		// Graph nodes
		const nodes: Record<string, TWorkflowGraphNode['workflowNode']> = {}
		// Conditional Edges
		const conditionalEdges: Record<string, [RunnableLike, string[]?]> = {}
		// Fixed Edge
		const edges: Record<string, string | string[]> = {}
		// Add task nodes and edges
		taskTools.tools.forEach((_) => {
			nodes[_.tool.name] = {graph: _.graph, ends: []}
			// Return to agent who calls it
			edges[_.tool.name] = _.caller
		})
		
		const summarize = ensureSummarize(team.summarize)
		// Next agent
		let nextNodeKey: string[] = []
		const agentKeys = new Set([agent.key])
		
		// Channels of workflow
		const channels: TStateChannel[] = []
		const pathMap = []
		if (summarizeTitle) {
			pathMap.push(GRAPH_NODE_TITLE_CONVERSATION)
		}
		if (summarize?.enabled) {
			pathMap.push(GRAPH_NODE_SUMMARIZE_CONVERSATION)
		}

		let startNodes: string[] = []

		/**
		 * The root node is responsible for the overall workflow
		 * 
		 * @param node next node
		 * @param parentKey The pre-node of this node
		 * @param finalReturn The end node if this node is the end of the workflow
		 */
		const createSubgraph = async (node: TXpertTeamNode, parentKey?: string, finalReturn?: string) => {
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
					mute: options.mute,
					store: options.store,
					xpert,
					options: {
						leaderKey: parentKey,
						isDraft: command.options.isDraft,
						subscriber
					},
					thread_id,
					rootController,
					signal,
					isTool: false,
					variables: toolsetVarirables,
					partners,
					environment: options.environment,
					isDraft: command.options.isDraft,
					subscriber
				})
				
				// Conditional Edges
				const ends = []
				// The failure process of non-starting agents is created here
				if (failNode) {
					ends.push(failNode.key)
					await createSubgraph(failNode, null, finalReturn)
				}
				nodes[node.key] = {
					graph: stateGraph,
					ends,
				}
				const _nextNodes = nextNodes.filter((_) => !(_.type === 'workflow' && AgenticWorkflowTypes.includes(_.entity.type)))
				if (_nextNodes?.length) {
					// One2many edge or one2one
					if (failNode || _nextNodes.length > 1) {
						conditionalEdges[node.key] = [(state) => {
							const channelState = getChannelState(state, channelName(node.key))
							if (channelState?.error) {
								return failNode ? [new Send(failNode.key, state)] : []
							}
							return _nextNodes.filter((_) => !!_).map(({key}) => new Send(key, state))
						}, _nextNodes.map(({key}) => key)]
					} else if (_nextNodes?.[0]?.key) {
						edges[node.key] = _nextNodes[0].key
					}
					for await (const nextNode of _nextNodes) {
						await createSubgraph(nextNode, node.key, finalReturn)
					}
				} else if (finalReturn) {
					if (failNode) {
						conditionalEdges[node.key] = [(state) => {
							const channelState = getChannelState(state, channelName(node.key))
							if (channelState?.error) {
								return failNode ? [new Send(failNode.key, state)] : []
							}
							return finalReturn
						}, [finalReturn]]
					} else {
						edges[node.key] = finalReturn
					}
				} else {
					nodes[node.key].ends.push(END)
					// edges[node.key] = END
				}
			} else if(node?.type === 'workflow') {
				if (nodes[node.key]) {
					return
				}
				const { workflowNode, navigator, nextNodes, channel, tool} = await this.commandBus.execute<CreateWorkflowNodeCommand, TWorkflowGraphNode>(
					new CreateWorkflowNodeCommand(xpert.id, graph, node, parentKey, {
						mute: options.mute,
						store: options.store,
						isDraft: options.isDraft,
						subscriber,
						environment,
						xpert: team
					}))
				if (channel) {
					channels.push(channel)
				}
				nodes[node.key] = {
					...workflowNode,
				}
				const graphNodeName = nodes[node.key].name || node.key
				// Agent Tools
				if (parentKey === agentKey) {
					pathMap.push(graphNodeName)
				}
				const workflowNodeEnds = [...nextNodes.map((n) => n.key)]
				if (!nextNodes.length) {
					workflowNodeEnds.push(END)
				}
				if (workflowNode.ends?.length) {
					workflowNodeEnds.push(...workflowNode.ends)
				}
				// Tool
				if (tool) {
					workflowTools.push({tool, parentKey})
					finalReturn = graphNodeName
					if (parentKey) {
						workflowNodeEnds.push(parentKey)
					}
				}
				if (navigator) {
					conditionalEdges[graphNodeName] = [navigator, workflowNodeEnds]
				} else {
					edges[graphNodeName] = nextNodes.map((n) => n.key)
				}

				for await (const nNode of nextNodes ?? []) {
					await createSubgraph(nNode, null, finalReturn)
				}
				
				if (!nextNodes.length) {
					if ((<IWFNAgentTool>node.entity).isEnd) {
						edges[graphNodeName] = END
					} else if (finalReturn) {
						edges[graphNodeName] = finalReturn
					}
				}
			}
		}

		if (isStart) {
			if (agentHasNextNodes) {
				const workflowNodes = next.filter((_) => !(_.type === 'workflow' && AgenticWorkflowTypes.includes(_.entity.type)))
				for await (const nextNode of workflowNodes) {
					await createSubgraph(nextNode, agentKey)
					pathMap.push(nextNode.key)
				}
				// The failure process of the starting agent is created here
				for await (const nextNode of fail) {
					// failNodeKey = nextNode.key
					await createSubgraph(nextNode, agentKey)
					pathMap.push(nextNode.key)
				}
				
				nextNodeKey = workflowNodes.map((n) => n.key)
				if (nextNodeKey?.some((_) => !_)) {
					console.error(`There is an empty nextNodeKey in Agent`)
				}
			}

			if (hiddenAgent) {
				startNodes = getWorkflowTriggers(graph, 'chat').map((n) => n.key)
			} else {
				startNodes = findStartNodes(getCurrentGraph(graph, agent.key), agent.key).filter((_) => _ !== agent.key)
			}
			if (startNodes.length) {
				for await (const key of startNodes) {
					const node = graph.nodes.find((_) => _.key === key)
					await createSubgraph(node, null)
				}
			}
		}
		// Agent tools in workflow
		for await (const nextNode of next.filter((_) => _.type === 'workflow' && _.entity.type === WorkflowNodeTypeEnum.AGENT_TOOL)) {
			await createSubgraph(nextNode, agentKey)
		}
		if (leaderKey) {
			agentKeys.add(leaderKey)
		}

		// Agent middlewares
		const agentMiddlewares: AgentMiddleware[] = await getAgentMiddlewares(graph, agent, this.agentMiddlewareRegistry, {
			tenantId: xpert.tenantId,
			userId: RequestContext.currentUserId(),
			workspaceId: xpert.workspaceId,
			projectId: options.projectId,
			conversationId: options.conversationId,
			xpertId: xpert.id,
			agentKey,
		})
		// Middleware tools
		const middlewareTools: TGraphTool[] = agentMiddlewares
			.filter((middleware) => middleware?.tools?.length)
			.flatMap((middleware) =>
				middleware.tools.map((tool) => ({
					toolset: {
						provider: middleware.name,
						title: tool.name,
					},
					caller: agent.key,
					tool
				}))
			)
		if (middlewareTools.length) {
			tools.push(...middlewareTools)
		}
		// Middleware state annotations
		const existedStateVariables = new Set<string>([
			...Object.keys(AgentStateAnnotation.spec),
			...(variables ?? []).map((variable) => variable.name),
			...stateVariables.map((variable) => variable.name)
		])
		const middlewareStateAnnotations = agentMiddlewares.reduce<Record<string, ReturnType<typeof Annotation>>>((acc, middleware) => {
			const shape = (middleware.stateSchema as any)?.shape
			if (!shape) {
				return acc
			}
			Object.keys(shape).forEach((key) => {
				if (key.startsWith('_') || existedStateVariables.has(key) || acc[key]) {
					return
				}
				acc[key] = Annotation({
					reducer: (a, b) => (b === undefined ? a : b),
					default: () => {
						try {
							const def = (shape as any)[key]?._def?.defaultValue
							if (typeof def === 'function') {
								return def()
							}
							if (def !== undefined) {
								return def
							}
						} catch (error) {
							// ignore default parse errors
						}
						return null
					}
				})
			})
			return acc
		}, {})

		const {
			beforeAgentHooks,
			beforeModelHooks,
			afterModelHooks,
			afterModelExecutionOrder,
			afterAgentHooks,
			afterAgentExecutionOrder,
			wrapToolCall
		} = getModelHooks(graph, agent, agentMiddlewares)

		// Model tools
		const withTools = [...tools.map((item) => item.tool), ...Object.keys(subAgents ?? {}).map((name) => subAgents[name].tool), ...(handoffTools ?? [])]
		pathMap.push(...withTools.map((tool) => tool.name))
		if (workflowTools.length) {
			withTools.push(...workflowTools.map((_) => _.tool))
		}

		// State
		// State channel for knowledgebase pipeline
		if (xpert.knowledgebase) {
			channels.push({
				name: KnowledgebaseChannel,
				annotation: Annotation<Record<string, unknown>>({
						reducer: (a, b) => {
							return b ? {
								...a,
								...b,
							} : a
						},
						default: () => ({})
					})
			})
		}
		// All workflow channels in local agent graph
		const parameters: TXpertParameter[] = []
		if (!hiddenAgent && agent.parameters?.length) {
			parameters.push(...agent.parameters)
		}
		if (team.agentConfig?.parameters?.length) {
			parameters.push(...team.agentConfig.parameters)
		}
		const workflowNodes = allChannels(graph, agent.key)
		// Collect channels used in the graph
		const SubgraphStateAnnotation = Annotation.Root({
			// Temp parameters
			...(variables?.reduce((state, schema) => {
				state[schema.name] = Annotation(stateVariable(schema))
				return state
			}, {}) ?? {}),
			...AgentStateAnnotation.spec, // Common agent states
			...middlewareStateAnnotations,
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
			...parameters.reduce((acc, parameter) => {
				acc[parameter.name] = Annotation(stateVariable(parameter))
				return acc
			}, {}),
			// Default channels for nodes
			...Object.fromEntries(uniq([...(hiddenAgent ? [] : [agent.key]), ...workflowNodes]).map((key) => {
				// for agent
				if (isAgentKey(key)) {
					const agent = graph.nodes.find((_) => _.type === 'agent' && _.key === key)
					return [
						channelName(key),
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
								system: '',
								messages: []
							})
						})
					]
				}
				// for workflow
				return [
					channelName(key),
					Annotation<Record<string, unknown>>({
						reducer: (a, b) => {
							return b ? {
								...a,
								...b,
							} : a
						},
						default: () => ({})
					})
				]
			})),
			// Channels for workflow nodes
			...channels.reduce((state, channel) => {
				state[channel.name] = channel.annotation
				return state
			}, {}),
		})

		const enableMessageHistory = !agent.options?.disableMessageHistory
		const historyVariable = agent.options?.historyVariable
		const errorHandling = agent.options?.errorHandling
		const hasAfterModelHooks = afterModelExecutionOrder.length > 0
		
		const stateModifier = async (state: typeof AgentStateAnnotation.State, isStart: boolean, jsonSchema: string) => {
			const { memories } = state
			const summary = getChannelState(state, agentChannel)?.summary
			const parameters = stateToParameters(state, environment)
			let systemTemplate = `Current time: ${new Date().toISOString()}\nYour ID is '${agent.key}'. Your name is '${agent.name || xpert.name}'.\n${parseXmlString(agent.prompt) ?? ''}`
			if (memories?.length) {
				systemTemplate += `\n\n<memories>\n${formatMemories(memories)}\n</memories>`
			}
			if (summary) {
				systemTemplate += `\nSummary of conversation earlier: \n${summary}`
			}
			const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
				templateFormat: 'mustache'
			}).format(parameters)
			if (jsonSchema) {
				systemMessage.content += `\n\n\`\`\`json\n${jsonSchema}\n\`\`\``
			}

			this.#logger.verbose(`SystemMessage of ${agentLabel(agent)}:`, systemMessage.content)

			const humanMessages: HumanMessage[] = []
			const messageHistory = getChannelState(state, agentChannel)?.messages ?? []

			// Determine whether it is Agent reflection (last message is not HumanMessage)
			const lastMessage = messageHistory[messageHistory.length - 1]
			if (isStart || !(isBaseMessage(lastMessage) && isToolMessage(lastMessage) && !endNodes.includes(lastMessage.name))) {
				// Is new human input: use message templates or input message
				const humanTemplates = agent.promptTemplates?.filter((_) => !!_.text?.trim())
				if (humanTemplates?.length) {
					for await (const temp of humanTemplates) {
						humanMessages.push(await HumanMessagePromptTemplate.fromTemplate(temp.text, {
							templateFormat: 'mustache'
						}).format(parameters))
					}
				}
				if (!humanMessages.length && state.human) {
					// Add attachments
					humanMessages.push(await createHumanMessage(this.commandBus, this.queryBus, state, agent.options?.vision))
				}
			}

			return {
				systemMessage,
				messageHistory: historyVariable ? get(state, historyVariable) as BaseMessage[] : messageHistory,
				humanMessages
			}
		}

		// Execute agent
		const callModel = async (state: typeof SubgraphStateAnnotation.State, config?: RunnableConfig) => {
			const {structuredChatModel, jsonSchema} = withStructured(chatModel, agent, withTools)
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
				const _fallbackChatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
					new GetXpertChatModelQuery(agent.team, null, {
						copilotModel: agent.options.fallback.copilotModel,
						abortController: rootController,
						usageCallback: assignExecutionUsage(execution)
					})
				)
				const {structuredChatModel: fallbackChatModel} = withStructured(_fallbackChatModel, agent, withTools)
				withFallbackModel = withFallbackModel.withFallbacks([fallbackChatModel])
			}

			// Error handling
			if (errorHandling?.type === 'defaultValue') {
				if (!errorHandling.defaultValue?.content) {
					throw new XpertConfigException(await this.i18nService.translate('xpert.Error.NoContent4DefaultValue',
						{
							lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
							args: {
								agent: agentLabel(agent)
							}
						}))
				}
				withFallbackModel = withFallbackModel.withFallbacks([
					new FakeStreamingChatModel({responses: [new AIMessage(errorHandling.defaultValue?.content)]})
				])
			}

			const {systemMessage, messageHistory, humanMessages} = await stateModifier(state, (<string>config.metadata.langgraph_triggers[0])?.startsWith(START), jsonSchema)
			// Disable history and new human request then remove history
			const deleteMessages = (!enableMessageHistory && humanMessages.length) ? messageHistory.map((m) => new RemoveMessage({ id: m.id as string })) : []
			const baseMessages = [
				...(((enableMessageHistory || !humanMessages.length) ? messageHistory : [])),
				...humanMessages
			]
			const baseRequest: ModelRequest<AgentBuiltInState> = {
				model: withFallbackModel,
				messages: baseMessages,
				systemMessage,
				tools: withTools,
				state,
				runtime: config
			}
			let systemMessageContent = systemMessage.content
			const defaultModelHandler: WrapModelCallHandler = async (request) => {
				const model = request.model ?? withFallbackModel
				const reqMessages = request.messages ?? baseMessages
				const systemMsg = request.systemMessage ?? systemMessage
				systemMessageContent = systemMsg.content
				const finalMessages = systemMsg ? [systemMsg, ...reqMessages] : reqMessages
				const response = await model.invoke(
					finalMessages,
					{...config, signal: abortController.signal}
				)
				if (isBaseMessage(response) && isAIMessage(response)) {
					const invalidToolCalls = response.invalid_tool_calls
					if (invalidToolCalls?.length) {
						const detail = invalidToolCalls.map((call) => `${call.name ?? call.id ?? 'tool'}: ${call.error ?? 'Invalid tool call'}\n${call.args}`).join('; ')
						throw new InternalServerErrorException(
							t('server-ai:Error.InvalidToolCalls') + detail
						)
					}
				}
				return response
			}
			const wrappedModelHandler = agentMiddlewares.reduceRight<WrapModelCallHandler>(
				(next, middleware) => {
					if (!middleware?.wrapModelCall) {
						return next
					}
					return (request) => middleware.wrapModelCall(request, next)
				},
				defaultModelHandler
			)
			try {
				const message = await wrappedModelHandler(baseRequest)

				const nState: Record<string, any> = {
					messages: [...humanMessages],
					[channelName(agentKey)]: {
						system: systemMessageContent,
						error: null,
						messages: [...deleteMessages, ...humanMessages]
					}
				}
				if (isBaseMessage(message) || isBaseMessageChunk(message)) {
					nState.messages.push(message)
					nState[channelName(agentKey)].messages.push(message)
					nState[channelName(agentKey)].output = stringifyMessageContent(message.content)
				} else if (message) {
					nState[channelName(agentKey)] = {
						...(message as Record<string, any>),
						...nState[channelName(agentKey)],
					}
				}
				const baseState: Record<string, any> = { ...nState }
				if (hasAfterModelHooks) {
					return baseState
				}
				return writeAgentMemories(baseState, agent.options?.memories)
			} catch(err) {
				if(errorHandling?.type === 'failBranch') {
					return {
						messages: [...deleteMessages, ...humanMessages, new AIMessage(`Error: ${getErrorMessage(err)}`)],
						[channelName(agentKey)]: {
							system: systemMessage.content,
							error: getErrorMessage(err),
							messages: [...deleteMessages, ...humanMessages, new AIMessage(`Error: ${getErrorMessage(err)}`)]
						}
					}
				}
				throw err
			}
		}
		
		const agentLoopEntryNode = beforeModelHooks[0]?.key ?? agentKey
		const agentStartNode = beforeAgentHooks[0]?.key ?? agentLoopEntryNode
		const agentDecisionNode = afterModelExecutionOrder[afterModelExecutionOrder.length - 1]?.key ?? agentKey
		const afterAgentEntryNode = afterAgentExecutionOrder[0]?.key
		const agentFinalExitNode = afterAgentExecutionOrder[afterAgentExecutionOrder.length - 1]?.key ?? agentDecisionNode

		const subgraphBuilder = new StateGraph<any, any, any, string>(SubgraphStateAnnotation)

		if (!hiddenAgent) {
			beforeAgentHooks.forEach(({ key, hook }) =>
				subgraphBuilder.addNode(
					key,
					createBeforeAgentNode(hook, agentChannel).withConfig({ runName: key, tags: [thread_id, xpert.id, key] })
				)
			)
			beforeModelHooks.forEach(({ key, hook }) =>
				subgraphBuilder.addNode(
					key,
					createBeforeModelNode(hook, agentChannel).withConfig({ runName: key, tags: [thread_id, xpert.id, key] })
				)
			)
			subgraphBuilder.addNode(agentKey, new RunnableLambda({ func: callModel })
					.withConfig({ runName: agentKey, tags: [thread_id, xpert.id, agentKey] }),
					{
						defer: hasMultipleInputs(graph, agent.key)
					}
				)
			afterModelExecutionOrder.forEach(({ key, hook }, index) =>
				subgraphBuilder.addNode(
					key,
					createAfterModelNode(hook, agentChannel, index === afterModelExecutionOrder.length - 1, errorHandling, agent.options?.memories)
						.withConfig({ runName: key, tags: [thread_id, xpert.id, key] })
				)
			)
			afterAgentExecutionOrder.forEach(({ key, hook }) =>
				subgraphBuilder.addNode(
					key,
					createAfterAgentNode(hook, agentChannel, errorHandling).withConfig({ runName: key, tags: [thread_id, xpert.id, key] })
				)
			)
			if (beforeAgentHooks.length) {
				for (let i = 0; i < beforeAgentHooks.length - 1; i++) {
					subgraphBuilder.addEdge(beforeAgentHooks[i].key, beforeAgentHooks[i + 1].key)
				}
				subgraphBuilder.addEdge(beforeAgentHooks[beforeAgentHooks.length - 1].key, agentLoopEntryNode)
			}
			if (beforeModelHooks.length) {
				for (let i = 0; i < beforeModelHooks.length - 1; i++) {
					subgraphBuilder.addEdge(beforeModelHooks[i].key, beforeModelHooks[i + 1].key)
				}
				subgraphBuilder.addEdge(beforeModelHooks[beforeModelHooks.length - 1].key, agentKey)
			}
			if (afterModelExecutionOrder.length) {
				subgraphBuilder.addEdge(agentKey, afterModelExecutionOrder[0].key)
				for (let i = 0; i < afterModelExecutionOrder.length - 1; i++) {
					subgraphBuilder.addEdge(afterModelExecutionOrder[i].key, afterModelExecutionOrder[i + 1].key)
				}
			}
			if (afterAgentExecutionOrder.length) {
				for (let i = 0; i < afterAgentExecutionOrder.length - 1; i++) {
					subgraphBuilder.addEdge(afterAgentExecutionOrder[i].key, afterAgentExecutionOrder[i + 1].key)
				}
			}
		}
		if (isStart && startNodes.length) {
			/**
			 * @todo use Send does not avoid multiple executions
			 */
			if (startNodes.length > 1) {
				subgraphBuilder.addConditionalEdges(START, (state) => startNodes.map((key) => new Send(key, state)), startNodes)
			} else {
				subgraphBuilder.addEdge(START, startNodes[0])
			}
		} else if (!hiddenAgent) {
			subgraphBuilder.addEdge(START, agentStartNode)
		} else if (isStart) {
			throw new XpertConfigException(t('server-ai:Error.NoTriggerNodes'))
		}

		// Add nodes for tools
		tools?.filter((_) => !_.graph).forEach(({ caller, tool, variables, toolset }) => {
			const name = tool.name
			const ends = []
			if (endNodes?.includes(tool.name)) {
				// If it is end of the agent, connect the subsequent nodes of the agent
				if (nextNodeKey?.length) {
					ends.push(...nextNodeKey)
					subgraphBuilder.addConditionalEdges(name, (state, config) => {
						return nextNodeKey.filter((_) => !!_).map((n) => new Send(n, state))
					})
				} else {
					// No subsequent node, go to the end
					subgraphBuilder.addEdge(name, END)
					ends.push(END)
				}
			} else {
				// Not the end of the agent, return to the agent node
				subgraphBuilder.addEdge(name, agentLoopEntryNode)
				// ends.push(agentKey)
			}
			subgraphBuilder
				.addNode(
					name, 
					new ToolNode([tool], { caller, variables, toolName: toolset.title, wrapToolCall }).withConfig({signal: abortController.signal}),
					{
						ends,
						metadata: omitBy({toolset: toolset.provider, toolsetId: toolset.id }, isNil)
					}
				)
		})

		handoffTools?.forEach((tool) => {
			const name = tool.name
			subgraphBuilder
				.addNode(
					name,
					new ToolNode([tool], { caller: '', toolName: tool.description })
						.withConfig({signal: abortController.signal}),
					{metadata: {toolset: 'transfer_to'}}
				)
		})

		// Sub Agents
		if (subAgents) {
			Object.keys(subAgents).forEach((name) => {
				subgraphBuilder.addNode(name, subAgents[name].stateGraph)

				if (endNodes?.includes(name)) {
					if (nextNodeKey?.length) {
						// if (nextNodeKey.some((_) => !_)) {
						// 	throw new InternalServerErrorException(`There is an empty nextNodeKey in tools`)
						// }
						subgraphBuilder.addConditionalEdges(name, (state, config) => {
							return nextNodeKey.filter((_) => !!_).map((n) => new Send(n, state))
						})
					} else {
						subgraphBuilder.addEdge(name, END)
					}
				} else {
					subgraphBuilder.addEdge(name, agentLoopEntryNode)
				}
			})
		}

		if (summarizeTitle && !hiddenAgent) {
			const titleAgent = await this.commandBus.execute(
				new CreateSummarizeTitleAgentCommand({
					xpert: team,
					rootController: rootController,
					rootExecutionId: command.options.rootExecutionId,
					channel: agentChannel
				})
			)
			subgraphBuilder.addNode(GRAPH_NODE_TITLE_CONVERSATION, titleAgent)
				.addEdge(GRAPH_NODE_TITLE_CONVERSATION, END)
		}
		if (summarize?.enabled) {
			subgraphBuilder.addNode(GRAPH_NODE_SUMMARIZE_CONVERSATION, createSummarizeAgent(chatModel, summarize, agentKey))
				.addEdge(GRAPH_NODE_SUMMARIZE_CONVERSATION, END)
		}

		// Conditional navigator for entry Agent
		if (!hiddenAgent) {
			const toolNames = withTools.map((tool) => tool.name);
			const decisionPathMap = afterAgentEntryNode ? [...pathMap, afterAgentEntryNode] : nextNodeKey.length ? pathMap : [...pathMap, END];

			subgraphBuilder.addConditionalEdges(
				agentDecisionNode,
				createAgentNavigator(
					agentChannel,
					summarize,
					summarizeTitle,
					afterAgentEntryNode ? undefined : nextNodeKey,
					isStart ? fail?.[0]?.key : undefined,
					afterAgentEntryNode
				),
				decisionPathMap
			);

			if (afterAgentEntryNode) {
				const exitPathMap = pathMap.filter((destination) => !toolNames.includes(destination));
				if (!nextNodeKey.length) {
					exitPathMap.push(END);
				}
				subgraphBuilder.addConditionalEdges(
					agentFinalExitNode,
					createAfterAgentNavigator(
						agentChannel,
						summarize,
						summarizeTitle,
						nextNodeKey,
						isStart ? fail?.[0]?.key : undefined
					),
					exitPathMap
				);
			}
		}

		// Has other nodes
		if (Object.keys(nodes).length) {
			Object.keys(nodes).forEach((name) => subgraphBuilder.addNode(
																	nodes[name].name || name,
																	nodes[name].graph.withConfig({signal: abortController.signal}),
																	{
																		ends: nodes[name].ends,
																		defer: hasMultipleInputs(graph, name)
																	}
																)
									  )
			Object.entries(edges).forEach(([name, value]) => {
				const ends: string[] = Array.isArray(value) ? value : [value]
				ends.forEach((end) => subgraphBuilder.addEdge(name, end))
			})
			Object.keys(conditionalEdges).forEach((name) => subgraphBuilder.addConditionalEdges(name, conditionalEdges[name][0] as any, conditionalEdges[name][1]))
		}

		// Verbose
		this.#logger.verbose(agentLabel(agent) + ': \n'+ Array.from(subgraphBuilder.allEdges).join('\n') + '\n\n' + Object.keys(subgraphBuilder.nodes))

		const compiledGraph = subgraphBuilder.compile({
			checkpointer: disableCheckpointer ? false : this.copilotCheckpointSaver,
			interruptBefore,
			name: agentKey,
			store: options.store
		})

		return {
			agent,
			graph: compiledGraph,
			nextNodes: next,
			failNode: fail?.[0],
			mute: mute,
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
		config: TAgentSubgraphParams & {
			xpert: Partial<IXpert>
			options: {
				leaderKey: string
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
		if (!agent.key) {
			throw new Error(`Key of Agent ${agentLabel(agent)} is empty!`)
		}
		const {graph, nextNodes, failNode} = await this.commandBus.execute<XpertAgentSubgraphCommand, TAgentSubgraphResult>(
			new XpertAgentSubgraphCommand(agent.key, xpert, {
				mute: config.mute,
				store: config.store,
				thread_id,
				rootController,
				signal,
				isStart: isTool,
				leaderKey,
				isDraft: config.options.isDraft,
				subscriber,
				execution,
				variables,
				channel: channelName(agent.key),
				partners,
				environment: config.environment,
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
			const configurable: TAgentRunnableConfigurable = config.configurable as TAgentRunnableConfigurable
			const { executionId } = configurable

			// Record start time
			const timeStart = Date.now()
			const _execution = await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...execution,
					threadId: configurable.thread_id,
					checkpointNs: configurable.checkpoint_ns,
					xpert: { id: xpert.id } as IXpert,
					agentKey: agent.key,
					inputs: call?.args,
					parentId: executionId,
					status: XpertAgentExecutionStatusEnum.RUNNING,
					predecessor: configurable.agentKey
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
						[STATE_VARIABLE_HUMAN]: {
							input: call.args.input,
						}
						// [`${agent.key}.messages`]: [new HumanMessage(call.args.input)]
					} : {}),
				}
				const output = await graph.invoke(
					subState,
					{
						...config,
						signal, 
						configurable: {
							...config.configurable,
							agentKey: agent.key,
							executionId: _execution.id
						},
						metadata: {
							agentKey: agent.key,
						}
					}
				)

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
						...(output[channelName(agent.key)] as Record<string, any>),
						messages: [lastMessage]
					}
				} : {
					messages: [lastMessage],
					[channelName(agent.key)]: {
						...(output[channelName(agent.key)] as Record<string, any>),
						messages: output.messages, // Return full messages to parent graph
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
			stateGraph: stateGraph.withConfig({tags: [xpert.id]}),
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

/**
 * Create conditionalEdges function for agent
 * 
 * @param agentChannel Channel name of agent
 * @param summarize Summarize config
 * @param summarizeTitle Is title summarize enabled
 * @param nextNodes Next nodes after agent
 * @param fail Failure node of agent
 * @returns conditionalEdgesFun
 */
function createAgentNavigator(agentChannel: string, summarize: TSummarize, summarizeTitle: boolean, nextNodes?: (string[] | ((state, config) => string)), fail?: string, exitNode?: string) {
	return (state: typeof AgentStateAnnotation.State, config) => {
		const { title } = state
		const subState = getChannelState(state, agentChannel)
		const messages = subState?.messages ?? []
		const lastMessage = messages[messages.length - 1]
		if (isBaseMessage(lastMessage) && isAIMessage(lastMessage)) {
			if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
				if (exitNode) {
					return exitNode
				}
				const nexts: Send[] = []
				// If there are more than six messages, then we summarize the conversation
				if (summarize?.enabled && messages.length > summarize.maxMessages) {
					nexts.push(new Send(GRAPH_NODE_SUMMARIZE_CONVERSATION, state))
				} else if (!title && summarizeTitle) {
					nexts.push(new Send(GRAPH_NODE_TITLE_CONVERSATION, state))
				}

				if (nextNodes && !subState?.error) {
					if (Array.isArray(nextNodes)) {
						if (nextNodes.length) {
							nexts.push(...nextNodes.filter((_) => !!_).map((name) => new Send(name, state)))
						}
					} else {
						nexts.push(new Send(nextNodes(state, config), state))
					}
				}

				if (nexts.length) {
					if (subState?.error && fail) {
						nexts.push(new Send(fail, state))
					}
					return nexts
				}

				if (subState?.error && fail) {
					return fail
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

		if (exitNode) {
			return exitNode
		}

		if (nextNodes) {
			if (Array.isArray(nextNodes)) {
				if (nextNodes.length) {
					return nextNodes.map((name) => new Send(name, state))
				}
			} else {
				return new Send(nextNodes(state, config), state)
			}
		}

		return END
	}
}

function createAfterAgentNavigator(agentChannel: string, summarize: TSummarize, summarizeTitle: boolean, nextNodes?: (string[] | ((state, config) => string)), fail?: string) {
	return (state: typeof AgentStateAnnotation.State, config) => {
		const { title } = state
		const subState = getChannelState(state, agentChannel)
		const messages = subState?.messages ?? []
		const lastMessage = messages[messages.length - 1]

		if (isBaseMessage(lastMessage) && isAIMessage(lastMessage)) {
			const nexts: Send[] = []
			if (summarize?.enabled && messages.length > summarize.maxMessages) {
				nexts.push(new Send(GRAPH_NODE_SUMMARIZE_CONVERSATION, state))
			} else if (!title && summarizeTitle) {
				nexts.push(new Send(GRAPH_NODE_TITLE_CONVERSATION, state))
			}

			if (nextNodes && !subState?.error) {
				if (Array.isArray(nextNodes)) {
					if (nextNodes.length) {
						nexts.push(...nextNodes.filter((_) => !!_).map((name) => new Send(name, state)))
					}
				} else {
					nexts.push(new Send(nextNodes(state, config), state))
				}
			}

			if (nexts.length) {
				if (subState?.error && fail) {
					nexts.push(new Send(fail, state))
				}
				return nexts
			}

			if (subState?.error && fail) {
				return fail
			}

			return END
		}

		if (nextNodes) {
			if (Array.isArray(nextNodes)) {
				if (nextNodes.length) {
					return nextNodes.map((name) => new Send(name, state))
				}
			} else {
				return new Send(nextNodes(state, config), state)
			}
		}

		if (subState?.error && fail) {
			return fail
		}

		return END
	}
}

// Fill tools or structured output into chatModel
function withStructured(chatModel: BaseChatModel, agent: IXpertAgent, withTools: TGraphTool['tool'][]) {
	let structuredChatModel = null
	let jsonSchema: string = null
	if (withTools.length) {
		if (agent.options?.parallelToolCalls === false && chatModel instanceof ChatOpenAI) {
			structuredChatModel = chatModel.bindTools(withTools, {parallel_tool_calls: false})
		} else {
			structuredChatModel = chatModel.bindTools(withTools)
		}
	} else if (agent.options?.structuredOutputMethod) {
		const zodSchema = z.object({
			...createParameters(agent.outputVariables),
		})
		if (agent.options.structuredOutputMethod === 'jsonMode') {
		  jsonSchema = ToolSchemaParser.serializeJsonSchema(ToolSchemaParser.parseZodToJsonSchema(zodSchema))
		}
		structuredChatModel = chatModel.withStructuredOutput(zodSchema, {method: agent.options.structuredOutputMethod})
	} else {
		structuredChatModel = chatModel
	}
	return {
		structuredChatModel,
		jsonSchema
	}
}

function getModelHooks(graph: TXpertGraph, agent: IXpertAgent, agentMiddlewares: AgentMiddleware[]) {
  const middlewareNodes = orderNodesByKeyOrder(
    getAgentMiddlewareNodes(graph, agent.key),
    agent.options?.middlewares?.order || []
  );
  const middlewareWithKeys = middlewareNodes.reduce<Array<{ key: string; middleware: AgentMiddleware }>>(
    (acc, node, index) => {
      const middleware = agentMiddlewares[index];
      if (middleware) {
        acc.push({ key: node.key, middleware });
      }
      return acc;
    },
    []
  );
  const beforeAgentHooks = middlewareWithKeys
    .map(({ key, middleware }) => {
      const hook =
        typeof middleware?.beforeAgent === "function"
          ? middleware.beforeAgent
          : middleware?.beforeAgent?.hook;
      return hook ? { key: key + "_before_agent", hook } : null;
    })
    .filter(Boolean);
  const beforeModelHooks = middlewareWithKeys
    .map(({ key, middleware }) => {
      const hook =
        typeof middleware?.beforeModel === "function"
          ? middleware.beforeModel
          : middleware?.beforeModel?.hook;
      return hook ? { key: key + '_before_model', hook } : null;
    })
    .filter(Boolean)
  const afterModelHooks = middlewareWithKeys
    .map(({ key, middleware }) => {
      const hook =
        typeof middleware?.afterModel === "function"
          ? middleware.afterModel
          : middleware?.afterModel?.hook;
      return hook ? { key: key + '_after_model', hook } : null;
    })
    .filter(Boolean)
  const afterModelExecutionOrder = [...afterModelHooks].reverse();
  const afterAgentHooks = middlewareWithKeys
    .map(({ key, middleware }) => {
      const hook =
        typeof middleware?.afterAgent === "function"
          ? middleware.afterAgent
          : middleware?.afterAgent?.hook;
      return hook ? { key: key + "_after_agent", hook } : null;
    })
    .filter(Boolean);
  const afterAgentExecutionOrder = [...afterAgentHooks].reverse();
  const wrapToolCall = agentMiddlewares.some((middleware) => middleware?.wrapToolCall)
    ? agentMiddlewares.reduceRight<WrapToolCallHook>(
        (next, middleware) => {
          if (!middleware?.wrapToolCall) {
            return next
          }
          return (request, handler) =>
            middleware.wrapToolCall(request, (nextRequest) => next(nextRequest, handler))
        },
        (request, handler) => handler(request)
      )
    : undefined

  return {
    beforeAgentHooks,
    beforeModelHooks,
    afterModelHooks,
    afterModelExecutionOrder,
    afterAgentHooks,
    afterAgentExecutionOrder,
    wrapToolCall,
  };
}

function createBeforeAgentNode(hook: BeforeModelHandler<typeof MessagesAnnotation.State, any>, agentChannel: string) {
  return createBeforeModelNode(hook, agentChannel);
}

function createBeforeModelNode(hook: BeforeModelHandler<typeof MessagesAnnotation.State, any>, agentChannel: string) {
  return new RunnableLambda({
    func: async (
      state: typeof AgentStateAnnotation.State,
      config?: RunnableConfig
    ): Promise<Partial<typeof AgentStateAnnotation.State>> => {
      const middlewareState = getChannelState(state, agentChannel);
      const result = await hook(middlewareState, { ...(config ?? {}), state });
      if (result && typeof result === "object") {
        const { jumpTo, ...partial } = result;
        if (jumpTo) {
          (config as any) ??= {};
          (config as any).jumpTo = jumpTo;
        }
        return {
          [agentChannel]: {
            ...middlewareState,
            ...partial,
          },
        };
      }
      return null
    },
  });
}

function createAfterModelNode(
  hook: AfterModelHandler<typeof MessagesAnnotation.State, any>,
  agentChannel: string,
  isLast: boolean,
  errorHandling?: IXpertAgent["options"]["errorHandling"],
  memories?: IXpertAgent["options"]["memories"]
) {
  return new RunnableLambda({
    func: async (state: typeof AgentStateAnnotation.State, config?: RunnableConfig): Promise<Record<string, any>> => {
	  const channelState = getChannelState(state, agentChannel);
      if (errorHandling?.type === "failBranch" && channelState?.error) {
        return state;
      }
      let nextState: Record<string, any> = { ...channelState };
      if (hook) {
        const result = await hook(channelState, config);
        if (result && typeof result === "object") {
          const { jumpTo, ...partial } = result;
          nextState = {
            ...nextState,
            ...partial,
          };
          if (jumpTo) {
            (config as any) ??= {};
            (config as any).jumpTo = jumpTo;
          }
        }
      }
      if (isLast) {
        return writeAgentMemories({...state, [agentChannel]: nextState}, memories);
      }
      return {...state, [agentChannel]: nextState};
    },
  });
}

function createAfterAgentNode(
  hook: AfterModelHandler<typeof MessagesAnnotation.State, any>,
  agentChannel: string,
  errorHandling?: IXpertAgent["options"]["errorHandling"]
) {
  return new RunnableLambda({
    func: async (state: typeof AgentStateAnnotation.State, config?: RunnableConfig): Promise<Record<string, any>> => {
	  const channelState = getChannelState(state, agentChannel);
      if (errorHandling?.type === "failBranch" && channelState?.error) {
        return state;
      }
      let nextState: Record<string, any> = { ...channelState };
      if (hook) {
        const result = await hook(state as any, config as any);
        if (result && typeof result === "object") {
          const { jumpTo, ...partial } = result as any;
          nextState = {
            ...nextState,
            ...partial,
          };
          if (jumpTo) {
            (config as any) ??= {};
            (config as any).jumpTo = jumpTo;
          }
		  return {[agentChannel]: nextState}
        }
      }
      return null;
    },
  });
}

function writeAgentMemories(state: Record<string, any>, memories?: IXpertAgent["options"]["memories"]) {
  if (!memories?.length) {
    return state;
  }
  const finalState: Record<string, any> = { ...state };
  const response = (finalState.messages as BaseMessage[] | undefined)?.[finalState.messages?.length - 1];

  memories?.forEach((item) => {
    if (item.inputType === "constant") {
      finalState[item.variableSelector] = item.value;
    } else if (item.inputType === "variable") {
      if (item.value === "content") {
        if (response && (isBaseMessage(response) || isBaseMessageChunk(response))) {
          finalState[item.variableSelector] = response.content;
        }
      } else if (item.value) {
        finalState[item.variableSelector] = get(response, item.value);
      }
    }
  });

  return finalState;
}
