import { BaseMessage } from '@langchain/core/messages'
import { RunnableLike } from '@langchain/core/runnables'
import { Annotation, CompiledStateGraph, END, messagesStateReducer, Send, START, StateGraph } from '@langchain/langgraph'
import {
	channelName,
	IXpert,
	IXpertAgentExecution,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertWorkflowSubgraphCommand } from '../workflow-subgraph.command'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { getChannelState, TAgentSubgraphResult } from '../../agent'
import { CreateWorkflowNodeCommand } from '../../workflow'
import {
	AgentStateAnnotation,
	hasMultipleInputs,
	identifyAgent,
	stateVariable,
	TStateChannel,
	TWorkflowGraphNode
} from '../../../shared'
import { XpertConfigException } from '../../../core/errors'
import { FindXpertQuery } from '../../../xpert/queries'

type TWorkflowSubgraphResult = {
	graph: CompiledStateGraph<any, any, any>
}

@CommandHandler(XpertWorkflowSubgraphCommand)
export class XpertWorkflowSubgraphHandler implements ICommandHandler<XpertWorkflowSubgraphCommand> {
	readonly #logger = new Logger(XpertWorkflowSubgraphHandler.name)

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertWorkflowSubgraphCommand): Promise<TWorkflowSubgraphResult> {
		const { graph, subGraph, options, xpert } = command
		const { rootController, signal, disableCheckpointer, variables, environment } = options
		const mute = options.mute ?? []
		const store = options.store
		const subscriber = options.subscriber
		const xpertTeam = xpert?.id
			? await this.queryBus.execute<FindXpertQuery, IXpert>(
					new FindXpertQuery({ id: xpert.id }, { isDraft: options.isDraft })
				)
			: (xpert as IXpert)

		const abortController = new AbortController()
		signal?.addEventListener('abort', () => abortController.abort())

		const startNodes = options.startNodes?.length
			? options.startNodes
			: getWorkflowStartNodes(subGraph)
		if (!startNodes.length) {
			throw new XpertConfigException('Workflow subgraph has no start nodes.')
		}

		const nodes: Record<string, TWorkflowGraphNode['workflowNode']> = {}
		const conditionalEdges: Record<string, [RunnableLike, string[]?]> = {}
		const edges: Record<string, string | string[]> = {}
		const channels: TStateChannel[] = []

		const nodeMap = new Map(subGraph.nodes.map((node) => [node.key, node]))

		const createSubgraphNode = async (node?: TXpertTeamNode) => {
			if (!node || nodes[node.key]) {
				return
			}
			if (node.type === 'workflow') {
				await createWorkflowNode(node)
			} else if (node.type === 'agent') {
				await createAgentNode(node)
			}
		}

		const createWorkflowNode = async (node: TXpertTeamNode & { type: 'workflow' }) => {
			const { workflowNode, navigator, nextNodes, channel } = await this.commandBus.execute<
				CreateWorkflowNodeCommand,
				TWorkflowGraphNode
			>(
				new CreateWorkflowNodeCommand(xpertTeam?.id ?? xpert.id, subGraph, node, null, {
					mute,
					store,
					isDraft: options.isDraft,
					subscriber,
					environment,
					xpert: xpertTeam ?? (xpert as Partial<IXpert>),
					conversationId: options.conversationId
				})
			)

			if (channel) {
				channels.push(channel)
			}

			nodes[node.key] = {
				...workflowNode
			}

			const graphNodeName = nodes[node.key].name || node.key
			const workflowNodeEnds = [...nextNodes.map((n) => n.key)]
			if (!nextNodes.length) {
				workflowNodeEnds.push(END)
			}
			if (workflowNode.ends?.length) {
				workflowNodeEnds.push(...workflowNode.ends)
			}
			if (navigator) {
				conditionalEdges[graphNodeName] = [navigator, workflowNodeEnds]
			} else if (nextNodes.length) {
				edges[graphNodeName] = nextNodes.map((n) => n.key)
			} else {
				edges[graphNodeName] = END
			}

			for await (const nextNode of nextNodes ?? []) {
				await createSubgraphNode(nextNode)
			}
		}

		const createAgentNode = async (node: TXpertTeamNode & { type: 'agent' }) => {
			const execution: IXpertAgentExecution = {}
			const compiled = await this.commandBus.execute<XpertAgentSubgraphCommand, TAgentSubgraphResult>(
				new XpertAgentSubgraphCommand(node.key, xpertTeam ?? xpert, {
					execution,
					mute,
					store,
					isDraft: options.isDraft,
					rootController,
					signal: abortController.signal,
					isStart: false,
					leaderKey: null,
					subscriber,
					variables,
					channel: channelName(node.key),
					partners: [],
					environment,
					graph: subGraph
				} as any)
			)

			const { nextNodes, failNode } = getAgentWorkflowEdges(subGraph, node.key)
			nodes[node.key] = {
				graph: compiled.graph,
				ends: failNode ? [failNode.key] : []
			}

			if (failNode) {
				await createSubgraphNode(failNode)
			}

			if (nextNodes.length > 0) {
				if (failNode || nextNodes.length > 1) {
					const targets = nextNodes.map((n) => n.key)
					conditionalEdges[node.key] = [
						(state) => {
							const channelState = getChannelState(state, channelName(node.key))
							if (channelState?.error) {
								return failNode ? [new Send(failNode.key, state)] : []
							}
							return targets.map((key) => new Send(key, state))
						},
						failNode ? [...targets, failNode.key] : targets
					]
				} else {
					edges[node.key] = nextNodes[0].key
				}

				for await (const nextNode of nextNodes) {
					await createSubgraphNode(nextNode)
				}
			} else if (failNode) {
				conditionalEdges[node.key] = [
					(state) => {
						const channelState = getChannelState(state, channelName(node.key))
						if (channelState?.error) {
							return [new Send(failNode.key, state)]
						}
						return END
					},
					[failNode.key, END]
				]
			} else {
				edges[node.key] = END
			}
		}

		for (const key of startNodes) {
			await createSubgraphNode(nodeMap.get(key))
		}

		const SubgraphStateAnnotation = Annotation.Root({
			...(variables?.reduce((state, schema) => {
				state[schema.name] = Annotation(stateVariable(schema))
				return state
			}, {}) ?? {}),
			...AgentStateAnnotation.spec,
			...Object.fromEntries(
				graph.nodes
					.filter((node) => node.type === 'agent' || node.type === 'workflow')
					.map((node) => {
						if (node.type === 'agent') {
							return [
								channelName(node.key),
								Annotation<{ messages: BaseMessage[] } & Record<string, unknown>>({
									reducer: (a, b) => {
										return b
											? {
													...a,
													...b,
													messages: b.messages
														? messagesStateReducer(a.messages, b.messages)
														: a.messages
												}
											: a
									},
									default: () => ({
										agent: identifyAgent(node.entity),
										system: '',
										messages: []
									})
								})
							]
						}
						return [
							channelName(node.key),
							Annotation<Record<string, unknown>>({
								reducer: (a, b) => {
									return b
										? {
												...a,
												...b
											}
										: a
								},
								default: () => ({})
							})
						]
					})
			),
			...channels.reduce((state, channel) => {
				state[channel.name] = channel.annotation
				return state
			}, {})
		})

		const subgraphBuilder = new StateGraph<any, any, any, string>(SubgraphStateAnnotation)

		if (startNodes.length > 1) {
			subgraphBuilder.addConditionalEdges(
				START,
				(state) => startNodes.map((key) => new Send(key, state)),
				startNodes
			)
		} else {
			subgraphBuilder.addEdge(START, startNodes[0])
		}

		Object.keys(nodes).forEach((name) => {
			subgraphBuilder.addNode(nodes[name].name || name, nodes[name].graph.withConfig({ signal: abortController.signal }), {
				ends: nodes[name].ends,
				defer: hasMultipleInputs(subGraph, name)
			})
		})

		Object.entries(edges).forEach(([name, value]) => {
			const ends: string[] = Array.isArray(value) ? value : [value]
			ends.forEach((end) => subgraphBuilder.addEdge(name, end))
		})
		Object.keys(conditionalEdges).forEach((name) =>
			subgraphBuilder.addConditionalEdges(name, conditionalEdges[name][0] as any, conditionalEdges[name][1])
		)

		this.#logger.verbose(
			`${xpertTeam?.id ?? xpert.id ?? 'workflow'}: \n${Array.from(subgraphBuilder.allEdges).join('\n')}\n\n${Object.keys(subgraphBuilder.nodes)}`
		)

		const compiledGraph = subgraphBuilder.compile({
			checkpointer: disableCheckpointer ? false : this.copilotCheckpointSaver,
			name: xpertTeam?.id ?? xpert.id ?? 'workflow',
			store
		})

		return {
			graph: compiledGraph
		}
	}
}

function getWorkflowStartNodes(graph: TXpertGraph) {
	const nodeKeys = new Set(
		graph.nodes.filter((node) => node.type === 'agent' || node.type === 'workflow').map((node) => node.key)
	)
	const incoming = new Set<string>()

	graph.connections
		.filter((conn) => conn.type === 'edge' || conn.type === 'workflow')
		.forEach((conn) => {
			const fromKey = conn.from.split('/')[0]
			if (!nodeKeys.has(fromKey) || !nodeKeys.has(conn.to)) {
				return
			}
			incoming.add(conn.to)
		})

	return Array.from(nodeKeys).filter((key) => !incoming.has(key))
}

function getAgentWorkflowEdges(graph: TXpertGraph, agentKey: string) {
	const nodeMap = new Map(graph.nodes.map((node) => [node.key, node]))

	const nextNodes = graph.connections
		.filter((conn) => ['edge', 'workflow'].includes(conn.type) && conn.from === agentKey)
		.map((conn) => nodeMap.get(conn.to))
		.filter(
			(node): node is TXpertTeamNode =>
				!!node &&
				(node.type === 'agent' || node.type === 'workflow') &&
				!(node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.TASK)
		)

	const failNode = graph.connections
		.filter((conn) => conn.type === 'edge' && conn.from === `${agentKey}/fail`)
		.map((conn) => nodeMap.get(conn.to))
		.find((node): node is TXpertTeamNode => !!node && (node.type === 'agent' || node.type === 'workflow'))

	return {
		nextNodes,
		failNode
	}
}
