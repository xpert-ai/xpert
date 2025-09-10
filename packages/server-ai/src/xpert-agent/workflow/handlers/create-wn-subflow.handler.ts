import { RunnableLambda } from '@langchain/core/runnables'
import { CompiledStateGraph } from '@langchain/langgraph'
import {
	channelName,
	IWFNSubflow,
	IXpert,
	IXpertAgent,
	IXpertAgentExecution,
	mapTranslationLanguage,
	setStateVariable,
	STATE_VARIABLE_INPUT,
	STATE_VARIABLE_SYS,
	TAgentRunnableConfigurable,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
} from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { assign, get } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { XpertAgentSubgraphCommand } from '../../commands/subgraph.command'
import { CreateWNSubflowCommand } from '../create-wn-subflow.command'
import { CompileGraphCommand } from '../../commands'
import { AgentStateAnnotation, nextWorkflowNodes } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

@CommandHandler(CreateWNSubflowCommand)
export class CreateWNSubflowHandler implements ICommandHandler<CreateWNSubflowCommand> {
	readonly #logger = new Logger(CreateWNSubflowHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateWNSubflowCommand) {
		const { xpertId, graph, node } = command
		const { isDraft, subscriber, environment } = command.options

		// Get the only child agent node
		const connections = graph.connections.filter((conn) => (conn.type === 'agent' || conn.type === 'xpert') && conn.from === node.key)
		if (connections.length > 1) {
			throw new InternalServerErrorException(
				await this.i18nService.translate('xpert.Error.MultiNodeNotSupported', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						node: node.entity.title || node.entity.key
					}
				})
			)
		}
		if (connections.length < 1) {
			throw new InternalServerErrorException(
				await this.i18nService.translate('xpert.Error.NoChildAgentForSubflow', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						key: node.key
					}
				})
			)
		}

		let extXpert: IXpert = null
		let _xpertId = xpertId
		let agentKey: string = null
		if (connections[0].type === 'xpert') {
			// Collaborator (external xpert)
			const collaboratorNode = graph.nodes.find(
				(n) => n.type === 'xpert' && n.key === connections[0].to
			) as TXpertTeamNode & { type: 'xpert' }
			if (collaboratorNode) {
				extXpert = collaboratorNode.entity
				_xpertId = collaboratorNode.key
				agentKey = collaboratorNode.entity.agent.key
			}
		} else {
			const agentNode = graph.nodes.find(
				(n) => n.type === 'agent' && n.key === connections[0].to
			) as TXpertTeamNode & { type: 'agent' }
			if (agentNode) {
				agentKey = agentNode.key
			}
		}

		const entity = node.entity as IWFNSubflow
		const inputParams = entity.inputParams
		const outputParams = entity.outputParams

		let subgraph = null
		// Execution for subagent
		const _execution: IXpertAgentExecution = {}
		const abortController = new AbortController()
		// Create graph by command
		if (extXpert) {
			const compiled = await this.commandBus.execute<
				CompileGraphCommand,
				{ graph: CompiledStateGraph<unknown, unknown>; agent: IXpertAgent }
			>(
				new CompileGraphCommand(agentKey, {id: _xpertId}, {
					isDraft,
					mute: command.options.mute,
					store: command.options.store,
					execution: _execution,
					rootController: abortController,
					signal: abortController.signal,
					subscriber,
					environment
				})
			)
			subgraph = compiled.graph
		} else {
			const compiled = await this.commandBus.execute<
				XpertAgentSubgraphCommand,
				{ agent: IXpertAgent; graph: CompiledStateGraph<any, any, any> }
			>(
				new XpertAgentSubgraphCommand(
					agentKey,
					{ id: _xpertId },
					{
						isDraft,
						mute: command.options.mute,
						store: command.options.store,
						isStart: true,
						rootController: abortController,
						signal: abortController.signal,
						execution: _execution,
						subscriber,
						// disableCheckpointer: true,
						channel: channelName(agentKey),
						partners: [],
						environment
					}
				)
			)
			subgraph = compiled.graph
		}

		return {
			workflowNode: {
				graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
					const configurable: TAgentRunnableConfigurable = config.configurable
					const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
					const inputs = inputParams?.reduce((acc, curr) => {
						setStateVariable(acc, curr.variable, get(state, curr.name))
						return acc
					}, {}) ?? {}

					// Execution for subflow
					const execution: IXpertAgentExecution = {
						category: 'workflow',
						type: WorkflowNodeTypeEnum.SUBFLOW,
						inputs: inputs,
						parentId: executionId,
						threadId: thread_id,
						checkpointNs: checkpoint_ns,
						checkpointId: checkpoint_id,
						agentKey: node.key,
						title: entity.title
					}

					return await wrapAgentExecution(
						async () => {
							assign(_execution, {
								inputs: inputs,
								parentId: execution.id,
								threadId: thread_id,
								checkpointNs: checkpoint_ns,
								checkpointId: checkpoint_id,
							})
							if (extXpert) {
								_execution.xpertId = extXpert.id
							} else {
								_execution.xpertId = xpertId
								_execution.agentKey = agentKey
							}

							const _state = await wrapAgentExecution(
								async (execution) => {
									const retState = await subgraph.invoke(
										{
											[STATE_VARIABLE_INPUT]: state[STATE_VARIABLE_INPUT],
											[STATE_VARIABLE_SYS]: state[STATE_VARIABLE_SYS],
											...inputs
										},
										{
											...config,
											signal: abortController.signal,
											configurable: {
												...config.configurable,
												executionId: execution.id
											}
										}
									)

									const outputState = outputParams?.reduce((acc, curr) => {
										acc[curr.name] = get(retState, curr.variable)
										return acc
									}, {}) ?? {}
									const output = retState[channelName(agentKey)]?.output

									execution.outputs = outputState
									
									return {
										state: {
											[channelName(node.key)]: outputState
										},
										output
									}
								},
								{
									commandBus: this.commandBus,
									queryBus: this.queryBus,
									subscriber: subscriber,
									execution: _execution
								}
							)()

							return {
								state: _state,
								output: execution.outputs
							}
						},
						{
							commandBus: this.commandBus,
							queryBus: this.queryBus,
							subscriber: subscriber,
							execution
						}
					)()
				}),
				ends: []
			},
			navigator: async (state: typeof AgentStateAnnotation.State, config) => {
				return nextWorkflowNodes(graph, node.key, state)
			}
		}
	}
}
