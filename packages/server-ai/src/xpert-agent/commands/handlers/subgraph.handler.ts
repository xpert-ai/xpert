import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { AIMessage, BaseMessage, HumanMessage, isAIMessage, isBaseMessage, isBaseMessageChunk, isToolMessage, RemoveMessage, ToolMessage } from '@langchain/core/messages'
import { HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { Runnable, RunnableConfig, RunnableLambda, RunnableLike } from '@langchain/core/runnables'
import {
	Annotation,
	BaseStore,
	Command,
	END,
	LangGraphRunnableConfig,
	messagesStateReducer,
	Send,
	START,
	StateGraph
} from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { agentLabel, agentUniqueName, allChannels, channelName, ChatMessageEventTypeEnum, findStartNodes, getCurrentGraph, GRAPH_NODE_SUMMARIZE_CONVERSATION, GRAPH_NODE_TITLE_CONVERSATION, isAgentKey, IXpert, IXpertAgent, IXpertAgentExecution, mapTranslationLanguage, STATE_VARIABLE_HUMAN, TAgentRunnableConfigurable, TStateVariable, TSummarize, TXpertAgentConfig, TXpertGraph, TXpertParameter, TXpertTeamNode, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { stringifyMessageContent } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { EnsembleRetriever } from 'langchain/retrievers/ensemble'
import { get, isNil, omitBy, uniq } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { Subscriber } from 'rxjs'
import z from 'zod'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertWorkflowQuery, GetXpertChatModelQuery } from '../../../xpert/queries'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { ToolNode } from './tool_node'
import { identifyAgent, parseXmlString, TGraphTool, TSubAgent } from './types'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { XpertConfigException } from '../../../core/errors'
import { FakeStreamingChatModel, getChannelState, messageEvent, TAgentSubgraphResult, TStateChannel } from '../../agent'
import { createParameters } from '../../workflow/parameter'
import { initializeMemoryTools, formatMemories } from '../../../copilot-store'
import { CreateMemoryStoreCommand } from '../../../xpert/commands'
import { CreateWorkflowNodeCommand } from '../../workflow'
import { toEnvState } from '../../../environment'
import { _BaseToolset, ToolSchemaParser, AgentStateAnnotation, createHumanMessage, stateToParameters, createSummarizeAgent, translate, stateVariable } from '../../../shared'
import { CreateSummarizeTitleAgentCommand } from '../summarize-title.command'


@CommandHandler(XpertAgentSubgraphCommand)
export class XpertAgentSubgraphHandler implements ICommandHandler<XpertAgentSubgraphCommand> {
	readonly #logger = new Logger(XpertAgentSubgraphHandler.name)

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: XpertAgentSubgraphCommand): Promise<TAgentSubgraphResult> {
		const { agentKeyOrName, xpert, options } = command
		const { isStart, execution, leaderKey, channel: agentChannel, summarizeTitle, subscriber, rootController, signal, disableCheckpointer, variables, partners, handoffTools, environment, tools: additionalTools, mute } = options
		const userId = RequestContext.currentUserId()

		// Signal controller in this subgraph
		const abortController = new AbortController()
		signal?.addEventListener('abort', () => abortController.abort())

		// I8n
		const i18n = await this.i18nService.t('xpert.Error', {lang: mapTranslationLanguage(RequestContext.getLanguageCode())})

		const {agent, graph, next, fail} = await this.queryBus.execute<GetXpertWorkflowQuery, {agent: IXpertAgent; graph: TXpertGraph; next: TXpertTeamNode[]; fail: TXpertTeamNode[]}>(
			new GetXpertWorkflowQuery(xpert.id, agentKeyOrName, command.options?.isDraft)
		)
		if (!agent) {
			throw new NotFoundException(
				`Xpert agent not found for '${xpert.name}' and key or name '${agentKeyOrName}', draft is ${command.options?.isDraft}`
			)
		}

		// Agent has next nodes or fail node
		const agentHasNextNodes = next?.length || fail?.length

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

		// Create memory store
		const store = await this.commandBus.execute<CreateMemoryStoreCommand, BaseStore>(new CreateMemoryStoreCommand(xpert, userId))

		// Create tools
		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, _BaseToolset[]>(
			new ToolsetGetToolsCommand(options?.toolsets ?? agent.toolsetIds, {
				projectId: options.projectId,
				conversationId: options.conversationId,
				xpertId: xpert.id,
				agentKey,
				signal: abortController.signal,
				env: toEnvState(environment)
			})
		)
		// Clean all toolsets when aborted
		abortController.signal.addEventListener('abort', () => {
			for (const toolset of toolsets) {
				toolset.close().catch((err) => this.#logger.debug(err))
			}
		})

		const endNodes = team.agentConfig?.endNodes ?? []
		const tools: TGraphTool[] = []
		const interruptBefore: string[] = []
		const toolsetVarirables: TStateVariable[] = []
		const stateVariables: TStateVariable[] = Array.from(team.agentConfig?.stateVariables ?? [])
		for await (const toolset of toolsets) {
			const _variables = await toolset.getVariables()
			toolsetVarirables.push(...(_variables ?? []))
			stateVariables.push(...toolsetVarirables)
			const items = await toolset.initTools()
			// Filter available tools by agent
			const availableTools = agent.options?.availableTools?.[toolset.getName()] ?? []
			items.filter((tool) => availableTools.length ? availableTools.includes(tool.name) : true)
			  .forEach((tool) => {
				const lc_name = get_lc_unique_name(tool.constructor as typeof Serializable)
				tools.push({
					toolset: {
						provider: toolset.providerName,
						id: toolset.getId(),
						title: translate(toolset.getToolTitle(tool.name))
					},
					caller: agent.key, 
					tool, 
					variables: team.agentConfig?.toolsMemory?.[lc_name],
				})

				// Add sensitive tools into interruptBefore
				if (team.agentConfig?.interruptBefore?.includes(lc_name)) {
					interruptBefore.push(tool.name)
				}
			})
		}

		// Additional Tools
		if (additionalTools) {
			additionalTools.forEach((tool) => {
				tools.push({ toolset: {provider: '', title: ''}, caller: agent.key, tool })
			})
		}

		// Memory tools
		if (team.memory?.enabled && team.memory?.qa?.enabled) {
			tools.push(...initializeMemoryTools(store, xpert.id).map((tool) => ({
				toolset: {
					provider: 'memories',
					title: translate({en_US: 'Memory', zh_Hans: '记忆' })
				},
				caller: agent.key,
				tool,
			})))
		}

		this.#logger.debug(`Use tools:\n${tools.length ? tools.map((_, i) => `${i+1}. ` + _.tool.name + ': ' + _.tool.description).join('\n') : 'No tools.'}`)

		// Knowledgebases
		const knowledgebaseIds = options?.knowledgebases ?? agent.knowledgebaseIds
		if (knowledgebaseIds?.length) {
			const recalls = team.agentConfig?.recalls
			const recall = agent.options?.recall
			const retrievers = knowledgebaseIds.map((id) => ({
				retriever: createKnowledgeRetriever(this.queryBus, id, {...(omitBy(recalls?.[id], isNil) ?? {}), ...(omitBy(recall, isNil) ?? {})}),
				weight: recalls?.[id]?.weight
			}))
			const retriever = new EnsembleRetriever({
				retrievers: retrievers.map(({retriever}) => retriever),
				weights: retrievers.map(({weight}) => weight ?? 0.5),
			  })
			tools.push({
				toolset: {
					provider: 'knowledgebase',
					title: translate({en_US: 'Knowledge Retriever', zh_Hans: '知识检索器' })
				},
				caller: agent.key,
				tool: retriever.asTool({
					name: "knowledge_retriever",
					description: "Get knowledges about question.",
					schema: z.string().describe(`key information of question`),
				  }),
			})
		}

		/**
		 * Sub agents: include followers (agents in one xpert team) and collaborators (external xperts: primary agent is entry)
		 */
		const subAgents: Record<string, TSubAgent> = {}
		if (agent.followers?.length) {
			this.#logger.debug(`Use sub agents:\n ${agent.followers.map((_) => _.name)}`)
			for await (const follower of agent.followers) {
				if (partners?.includes(follower.key)) {
					continue
				}
				const item = await this.createAgentSubgraph(follower, {
					mute,
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
					mute,
					xpert: collaborator,
					options: {
						leaderKey: agentKey,
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
				// Collect mute config for external xpert
				if (collaborator.agentConfig?.mute?.length) {
					mute.push(...collaborator.agentConfig.mute.map((_) => [collaborator.id, ..._]))
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
		const startNodes = findStartNodes(getCurrentGraph(graph, agent.key), agent.key).filter((_) => _ !== agent.key)
		const pathMap = [...withTools.map((tool) => tool.name)]
		if (summarizeTitle) {
			pathMap.push(GRAPH_NODE_TITLE_CONVERSATION)
		}
		if (summarize?.enabled) {
			pathMap.push(GRAPH_NODE_SUMMARIZE_CONVERSATION)
		}
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
						mute,
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
						partners
					})
					
					// Conditional Edges
					const ends = []
					if (failNode) {
						ends.push(failNode.key)
						await createSubgraph(null, failNode)
					}
					nodes[node.key] = {graph: stateGraph, ends}
					if (nextNodes?.length) {
						// One2many edge or one2one
						if (nextNodes?.length > 1) {
							conditionalEdges[node.key] = [(state) => {
								return nextNodes.filter((_) => !!_).map(({key}) => new Send(key, state))
							}, nextNodes.map(({key}) => key)]
						} else if (nextNodes?.[0]?.key) {
							edges[node.key] = nextNodes[0].key
						}
						for await (const nextNode of nextNodes) {
							await createSubgraph(nextNode, null)
						}
					} else {
						edges[node.key] = END
					}
				} else if(node?.type === 'workflow') {
					if (nodes[node.key]) {
						return
					}
					const { workflowNode, navigator, nextNodes, channel } = await this.commandBus.execute(
						new CreateWorkflowNodeCommand(xpert.id, graph, node, parentKey, {
							mute,
							isDraft: options.isDraft,
							subscriber,
							environment,
							xpert: team
						}))
					if (channel) {
						channels.push(channel)
					}
					nodes[node.key] = {
						...workflowNode
					}
					const workflowNodeEnds = [...nextNodes.map((n) => n.key)]
					if (!nextNodes.length) {
						workflowNodeEnds.push(END)
					}
					conditionalEdges[node.key] = [navigator, workflowNodeEnds]
					for await (const nNode of nextNodes ?? []) {
						await createSubgraph(nNode, null)
					}
				}

				if (fail && !agentKeys.has(fail.key) && fail.type === 'agent') {
					agentKeys.add(fail.key)
					const {stateGraph, nextNodes, failNode} = await this.createAgentSubgraph(fail.entity, {
						mute,
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
						partners
					})
	
					nodes[fail.key] = {graph: stateGraph, ends: []}
					if (nextNodes?.length || failNode) {
						await createSubgraph(nextNodes?.[0], failNode)
					}
				}
			}

			if (agentHasNextNodes) {
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
				// conditionalEdges[agentKey] = [
				// 	createAgentNavigator(channelName(agentKey), summarize, summarizeTitle, nextNodeKey),
				// 	pathMap
				// ]
			}

			if (startNodes.length) {
				for await (const key of startNodes) {
					const node = graph.nodes.find((_) => _.key === key)
					await createSubgraph(node, null)
				}
			}
		}
		if (leaderKey) {
			agentKeys.add(leaderKey)
		}

		// State
		const workflowNodes = allChannels(graph, agent.key)
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
			// Default channels for nodes
			...Object.fromEntries(uniq([agent.key, ...workflowNodes]).map((key) => {
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
				if (!humanMessages.length && state.input) {
					// Add attachments
					humanMessages.push(await createHumanMessage(this.commandBus, this.queryBus, state.human, agent.options?.vision))
				}
			}

			return {
				systemMessage,
				messageHistory,
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
			const errorHandling = agent.options?.errorHandling
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
			try {
				const message = await withFallbackModel.invoke([
					systemMessage, ...((enableMessageHistory || !humanMessages.length) ? messageHistory : []), ...humanMessages
				], {...config, signal: abortController.signal})

				const messages = [...deleteMessages, ...humanMessages]
				const nState: Record<string, any> = {
					messages: [...messages],
					[channelName(agentKey)]: {messages}
				}
				if (isBaseMessage(message) || isBaseMessageChunk(message)) {
					nState.messages.push(message)
					nState[channelName(agentKey)].messages.push(message)
					nState[channelName(agentKey)].output = stringifyMessageContent(message.content)
				} else if (message) {
					nState[channelName(agentKey)] = {
						...message,
						...nState[channelName(agentKey)],
					}
				}
				// Write to memory
				agent.options?.memories?.forEach((item) => {
					if (item.inputType === 'constant') {
						nState[item.variableSelector] = item.value
					} else if (item.inputType === 'variable') {
						if (item.value === 'content') {
							if (isBaseMessage(message) || isBaseMessageChunk(message)) {
								nState[item.variableSelector] = message.content
							}
						} else if (item.value) {
							nState[item.variableSelector] = get(message, item.value)
						}
					}
				})

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
		if (isStart && startNodes.length) {
			/**
			 * @todo use Send does not avoid multiple executions
			 */
			if (startNodes.length > 1) {
				subgraphBuilder.addConditionalEdges(START, (state) => startNodes.map((key) => new Send(key, state)), startNodes)
			} else {
				subgraphBuilder.addEdge(START, startNodes[0])
			}
		} else {
			subgraphBuilder.addEdge(START, agentKey)
		}

		// Add nodes for tools
		tools?.forEach(({ caller, tool, variables, toolset }) => {
			const name = tool.name
			subgraphBuilder
				.addNode(
					name, 
					new ToolNode([tool], { caller, variables }).withConfig({signal: abortController.signal}),
					{metadata: {toolset: toolset.provider, toolsetId: toolset.id, toolName: toolset.title}}
				)
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
				.addNode(
					name,
					new ToolNode([tool], { caller: '' })
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
		if (!nextNodeKey.length) {
			pathMap.push(END)
		}
		subgraphBuilder.addConditionalEdges(agentKey, createAgentNavigator(agentChannel, summarize, summarizeTitle, nextNodeKey), pathMap)

		// Has other nodes
		if (Object.keys(nodes).length) {
			Object.keys(nodes).forEach((name) => subgraphBuilder.addNode(
																	name,
																	nodes[name].graph.withConfig({signal: abortController.signal}),
																	{ends: nodes[name].ends}
																)
									  )
			Object.keys(edges).forEach((name) => subgraphBuilder.addEdge(name, edges[name]))
			Object.keys(conditionalEdges).forEach((name) => subgraphBuilder.addConditionalEdges(name, conditionalEdges[name][0], conditionalEdges[name][1]))
		}

		// Verbose
		this.#logger.verbose(agentLabel(agent) + ': \n'+ Array.from(subgraphBuilder.allEdges).join('\n') + '\n\n' + Object.keys(subgraphBuilder.nodes))

		const compiledGraph = subgraphBuilder.compile({
			checkpointer: disableCheckpointer ? false : this.copilotCheckpointSaver,
			interruptBefore,
			name: agentKey,
			store
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
		config: {
			mute: TXpertAgentConfig['mute']
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
		const { mute, xpert, options, isTool, thread_id, rootController, signal, variables, partners } = config
		const { subscriber, leaderKey } = options
		const execution: IXpertAgentExecution = {}

		// Subgraph
		if (!agent.key) {
			throw new Error(`Key of Agent ${agentLabel(agent)} is empty!`)
		}
		const {graph, nextNodes, failNode} = await this.commandBus.execute<XpertAgentSubgraphCommand, TAgentSubgraphResult>(
			new XpertAgentSubgraphCommand(agent.key, xpert, {
				mute,
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
			stateGraph: stateGraph.withConfig({tags: [xpert.id]}),
		} as TSubAgent
	}

	/**
	 * @deprecated use CreateSummarizeTitleAgentCommand
	 */
	// async createTitleAgent(xpert: IXpert, options: {rootController: AbortController; rootExecutionId: string; agentKey?: string;}) {
	// 	const {rootController, rootExecutionId, agentKey} = options
	// 	const execution = {} as TXpertAgentExecution
	// 	const copilotModel = xpert.copilotModel
	// 	if (!copilotModel) {
	// 		throw new XpertCopilotNotFoundException(await this.i18nService.t('xpert.Error.XpertCopilotNotFound', {
	// 			lang: mapTranslationLanguage(RequestContext.getLanguageCode())
	// 		}))
	// 	}
	// 	execution.metadata = {
	// 		provider: copilotModel.copilot.modelProvider?.providerName,
	// 		model: copilotModel.model || copilotModel.copilot.copilotModel?.model
	// 	}
	// 	const chatModel = await this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
	// 		new GetXpertChatModelQuery(xpert, null, {
	// 			copilotModel: copilotModel,
	// 			abortController: rootController,
	// 			usageCallback: assignExecutionUsage(execution)
	// 		})
	// 	)
		
	// 	return async (state: typeof AgentStateAnnotation.State, config: RunnableConfig): Promise<Partial<typeof AgentStateAnnotation.State>> => {
	// 		// Record start time
	// 		const timeStart = Date.now()
	// 		let status = XpertAgentExecutionStatusEnum.SUCCESS
	// 		let error = null
	// 		let result = null
	// 		const _execution = await this.commandBus.execute(
	// 			new XpertAgentExecutionUpsertCommand({
	// 				...execution,
	// 				xpert: { id: xpert.id } as IXpert,
	// 				parentId: rootExecutionId,
	// 				status: XpertAgentExecutionStatusEnum.RUNNING,
	// 				channelName: STATE_VARIABLE_TITLE_CHANNEL
	// 			})
	// 		)

	// 		try {
	// 			// Title the conversation
	// 			const messages = (<TMessageChannel>state[channelName(agentKey)]).messages
	// 			const language = state[STATE_VARIABLE_SYS]?.language
			
	// 			const allMessages = [...messages, new HumanMessage({
	// 				id: uuidv4(),
	// 				content: `Create a short title${language ? ` in language '${language}'` : ''} for the conversation above, without adding any extra phrases like 'Conversation Title:':`,
	// 			})]
	// 			const response = await chatModel.invoke(allMessages, {tags: [GRAPH_NODE_TITLE_CONVERSATION]});
	// 			result = response.content
	// 			if (typeof response.content !== "string") {
	// 				throw new Error("Expected a string response from the model");
	// 			}
				
	// 			return {
	// 				title: response.content.replace(/^"/g, '').replace(/"$/g, ''),
	// 				[STATE_VARIABLE_TITLE_CHANNEL]: {
	// 					messages: [...allMessages, response]
	// 				}
	// 			}
	// 		} catch (err) {
	// 			error = getErrorMessage(err)
	// 			status = XpertAgentExecutionStatusEnum.ERROR
	// 		} finally {
	// 			const timeEnd = Date.now()
	// 			// Record End time
	// 			await this.commandBus.execute(
	// 				new XpertAgentExecutionUpsertCommand({
	// 					..._execution,
	// 					threadId: config.configurable.thread_id,
	// 					checkpointId: config.configurable.checkpoint_id,
	// 					checkpointNs: '',
	// 					elapsedTime: timeEnd - timeStart,
	// 					status,
	// 					error,
	// 					outputs: {
	// 						output: result
	// 					}
	// 				})
	// 			)
	// 		}
	// 	}
	// }
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
					nexts.push(new Send(GRAPH_NODE_SUMMARIZE_CONVERSATION, state))
				} else if (!title && summarizeTitle) {
					nexts.push(new Send(GRAPH_NODE_TITLE_CONVERSATION, state))
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
