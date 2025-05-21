import { RunnableLambda } from '@langchain/core/runnables'
import { CompiledStateGraph, END, Send } from '@langchain/langgraph'
import {
	channelName,
	IWFNSubflow,
	IXpertAgent,
	IXpertAgentExecution,
	mapTranslationLanguage,
	TAgentRunnableConfigurable,
	TXpertTeamNode,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { get } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { wrapAgentExecution } from '../../../xpert-agent-execution/utils'
import { XpertAgentSubgraphCommand } from '../../commands/subgraph.command'
import { CreateWNSubflowCommand } from '../create-wn-subflow.command'
import { AgentStateAnnotation, stateToParameters } from '../../../shared'

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
		const connections = graph.connections.filter((conn) => conn.type === 'agent' && conn.from === node.key)
		if (connections.length > 1) {
			throw new InternalServerErrorException(
				await this.i18nService.translate('xpert.Error.MultiNodeNotSupported', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
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
		const agentNode = graph.nodes.find(
			(n) => n.type === 'agent' && n.key === connections[0].to
		) as TXpertTeamNode & { type: 'agent' }

		const entity = node.entity as IWFNSubflow

		const _execution = {
			agentKey: agentNode.key,
			title: agentNode.entity.title
		}
		const abortController = new AbortController()
		// Create graph by command
		const { agent, graph: subgraph } = await this.commandBus.execute<
			XpertAgentSubgraphCommand,
			{ agent: IXpertAgent; graph: CompiledStateGraph<any, any, any> }
		>(
			new XpertAgentSubgraphCommand(
				agentNode.key,
				{ id: xpertId },
				{
					isDraft,
					isStart: true,
					rootController: abortController,
					signal: abortController.signal,
					execution: _execution,
					subscriber,
					disableCheckpointer: true,
					variables: entity.inputs?.map((item) => ({
						name: item.name,
						type: XpertParameterTypeEnum.STRING,
					})),
					channel: channelName(agentNode.key),
					partners: []
				}
			)
		)

		return {
			workflowNode: {
				graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
					const configurable: TAgentRunnableConfigurable = config.configurable
					const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
					const _state = stateToParameters(state, environment)
					const inputs = entity.inputs?.reduce((params, { name, variable }) => {
						params[name] = get(_state, variable)
						return params
					}, {})

					const execution: IXpertAgentExecution = {
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
							const __execution: IXpertAgentExecution = {
								..._execution,
								inputs: inputs,
								parentId: execution.id,
								threadId: thread_id,
								checkpointNs: checkpoint_ns,
								checkpointId: checkpoint_id,
								agentKey: agentNode.key,
								title: agentNode.entity.title
							}

							const _state = await wrapAgentExecution(
								async () => {
									const retState = await subgraph.invoke(
										{ ...state, ...inputs },
										{
											...config,
											signal: abortController.signal,
											configurable: {
												...config.configurable,
												executionId: execution.id
											}
										}
									)

									return {
										state: {
											[channelName(node.key)]: entity.outputs?.reduce((params, { name, variable }) => {
												params[name] = get(retState, variable)
												return params
											}, {})
										}
									}
								},
								{
									commandBus: this.commandBus,
									queryBus: this.queryBus,
									subscriber: subscriber,
									execution: __execution
								}
							)()

							return {
								state: _state
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
				const connections = graph.connections.filter((conn) => conn.type === 'edge' && conn.from === node.key)
				return connections.length > 0 ? connections.map((conn) => new Send(conn.to, state)) : END
			}
		}
	}
}
