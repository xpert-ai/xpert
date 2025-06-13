import { RunnableLambda } from '@langchain/core/runnables'
import { CompiledStateGraph, END, Send } from '@langchain/langgraph'
import {
	channelName,
	IteratingIndexParameterName,
	IteratingItemParameterName,
	IWFNIterating,
	IXpert,
	IXpertAgent,
	IXpertAgentExecution,
	mapTranslationLanguage,
	setStateVariable,
	TAgentRunnableConfigurable,
	TXpertTeamNode,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { compact, get, isString } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { wrapAgentExecution } from '../../../xpert-agent-execution/utils'
import { AgentStateAnnotation } from '../../commands/handlers/types'
import { XpertAgentSubgraphCommand } from '../../commands/subgraph.command'
import { CreateWNIteratingCommand } from '../create-wn-iterating.command'
import { STATE_VARIABLE_ITERATING_OUTPUT, STATE_VARIABLE_ITERATING_OUTPUT_STR } from '../iterating'
import { CompileGraphCommand } from '../../commands'

@CommandHandler(CreateWNIteratingCommand)
export class CreateWNIteratingHandler implements ICommandHandler<CreateWNIteratingCommand> {
	readonly #logger = new Logger(CreateWNIteratingHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateWNIteratingCommand) {
		const { xpertId, graph, node, options } = command
		const { subscriber, isDraft } = options

		const entity = node.entity as IWFNIterating

		// Get the only child agent node
		const connections = graph.connections.filter((conn) => (conn.type === 'agent' || conn.type === 'xpert') && conn.from === node.key)
		if (connections.length > 1) {
			throw new InternalServerErrorException(await this.translate('xpert.Error.MultiNodeNotSupported', entity))
		}
		if (connections.length < 1) {
			throw new InternalServerErrorException(await this.translate('xpert.Error.NoChildNodeForLoop', entity))
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

		const inputVariable = entity.inputVariable
		const inputParams = entity.inputParams
		const outputParams = entity.outputParams

		if (!inputParams?.length) {
			throw new InternalServerErrorException(await this.translate('xpert.Error.InputParamsRequired', entity))
		}

		if (!outputParams?.length) {
			throw new InternalServerErrorException(await this.translate('xpert.Error.OutputParamsRequired', entity))
		}

		let subgraph = null
		const execution: IXpertAgentExecution = {}
		const abortController = new AbortController()
		// Create graph by command
		if (extXpert) {
			const compiled = await this.commandBus.execute<
				CompileGraphCommand,
				{ graph: CompiledStateGraph<unknown, unknown>; agent: IXpertAgent }
			>(
				new CompileGraphCommand(agentKey, {id: _xpertId}, {
					isDraft,
					execution,
					rootController: abortController,
					signal: abortController.signal,
					subscriber,
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
						isStart: true,
						rootController: abortController,
						signal: abortController.signal,
						execution,
						subscriber,
						disableCheckpointer: true,
						channel: channelName(agentKey),
						partners: []
					}
				)
			)
			subgraph = compiled.graph
		}

		return {
			workflowNode: {
				graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
					const configurable: TAgentRunnableConfigurable = config.configurable
					const { subscriber, executionId } = configurable
					const parameterValue = get(state, inputVariable)

					const parallel = entity.parallel
					const maximum = entity.maximum
					const errorMode = entity.errorMode
					const invokeSubgraph = async (item, index: number) => {
						const originalState = isString(item) ? {[IteratingIndexParameterName]: index, [IteratingItemParameterName]: item}
						  : {...(item ?? {}), [IteratingIndexParameterName]: index, [IteratingItemParameterName]: item}
						let inputs = {}
						const _state = {...state, ...originalState}
						inputs = inputParams.reduce((acc, curr) => {
							setStateVariable(acc, curr.variable, get(_state, curr.name))
							return acc
						}, inputs)

						const itemExecution: IXpertAgentExecution = {
							category: 'workflow',
							type: WorkflowNodeTypeEnum.ITERATING,
							xpert: { id: xpertId } as IXpert,
							agentKey: node.key,
							inputs: item,
							title: entity.title,
							parentId: executionId
						}

						return await wrapAgentExecution(
							async () => {
								const subAgentExecution: IXpertAgentExecution = {
									inputs: inputs,
									parentId: itemExecution.id
								}
								if (extXpert) {
									subAgentExecution.xpertId = extXpert.id
								} else {
									subAgentExecution.xpertId = xpertId
									subAgentExecution.agentKey = agentKey
								}
		
								const retState = await wrapAgentExecution(
									async () => {
										const retState = await subgraph.invoke(
											{
												...state,
												...inputs
											},
											{
												...config,
												signal: controller.signal,
												configurable: {
													...config.configurable,
													executionId: subAgentExecution.id
												}
											}
										)
		
										const outputItem = outputParams.reduce((acc, curr) => {
											if (curr.name === IteratingItemParameterName) {
												return get(retState, curr.variable)
											}
											acc[curr.name] = get(retState, curr.variable)
											return acc
										}, {})
										const output = retState[channelName(agentKey)]?.output
		
										return {
											state: outputItem,
											output: output
										}
									},
									{
										commandBus: this.commandBus,
										queryBus: this.queryBus,
										subscriber,
										execution: subAgentExecution
									}
								)()

								return {
									state: retState,
									output: retState as string
								}
							},
							{
								commandBus: this.commandBus,
								queryBus: this.queryBus,
								subscriber,
								execution: itemExecution
							}
						)()
					}

					const controller = new AbortController()
					config.signal.addEventListener('abort', () => {
						if (!controller.signal.aborted) {
							try {
								controller.abort()
							} catch (err) {
								//
							}
						}
					})

					let outputs = null
					if (Array.isArray(parameterValue)) {
						outputs = new Array(parameterValue.length).fill(null)
						if (parallel) {
							// Execute in parallel with a maximum concurrency limit using a task pool
							const taskPool = new Set()
							let index = 0
							for await (const item of parameterValue) {
								const i = index
								// If the task pool is full, wait for one task to complete
								if (taskPool.size >= maximum) {
									await Promise.race(taskPool)
								}

								// Create a new task and add it to the pool
								const task = invokeSubgraph(item, i)
									.then((output) => {
										outputs[i] = output
									})
									.catch((err) => {
										switch (errorMode) {
											case 'terminate': {
												throw err
											}
											case 'ignore': {
												this.#logger.error(err)
												break
											}
											case 'remove': {
												this.#logger.error(err)
												break
											}
										}
									})
									.finally(() => {
										// Remove the task from the pool once it completes
										taskPool.delete(task)
									})

								taskPool.add(task)
								index++
							}

							// Wait for all remaining tasks to complete
							await Promise.all(taskPool)
						} else {
							// Execute sequentially
							let index = 0
							for await (const item of parameterValue) {
								// Check signal status
								if (config.signal.aborted) {
									return
								}
								const i = index
								try {
									outputs[i] = await invokeSubgraph(item, i)
								} catch (err) {
									switch (errorMode) {
										case 'terminate': {
											throw err
										}
										case 'ignore': {
											this.#logger.error(err)
											break
										}
										case 'remove': {
											this.#logger.error(err)
											break
										}
									}
								} finally {
									index++
								}
							}
						}
					}

					if (errorMode === 'remove') {
						outputs = compact(outputs)
					}

					return {
						[channelName(node.key)]: {
							[STATE_VARIABLE_ITERATING_OUTPUT]: outputs,
							[STATE_VARIABLE_ITERATING_OUTPUT_STR]: outputs?.map((_) =>
								typeof _ === 'string' ? _ : JSON.stringify(_, null, 2)
							).join('\n'),
						}
					}
				}),
				ends: []
			},
			navigator: async (state: typeof AgentStateAnnotation.State, config) => {
				const connections = graph.connections.filter((conn) => conn.type === 'edge' && conn.from === node.key)
				return connections.length > 0 ? connections.map((conn) => new Send(conn.to, state)) : END
			}
		}
	}

	async translate(key: string, entity: IWFNIterating) {
		return await this.i18nService.translate(key, {
				lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
				args: {
					node: entity.title || entity.key
				}
			})
	}
}
