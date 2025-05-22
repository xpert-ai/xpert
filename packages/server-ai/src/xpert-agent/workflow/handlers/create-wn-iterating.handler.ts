import { RunnableLambda } from '@langchain/core/runnables'
import { CompiledStateGraph, END, Send } from '@langchain/langgraph'
import {
	channelName,
	IWFNIterating,
	IXpert,
	IXpertAgent,
	IXpertAgentExecution,
	mapTranslationLanguage,
	setStateVariable,
	STATE_VARIABLE_SYS,
	TAgentRunnableConfigurable,
	TXpertTeamNode
} from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { compact, get } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { wrapAgentExecution } from '../../../xpert-agent-execution/utils'
import { AgentStateAnnotation, STATE_VARIABLE_INPUT } from '../../commands/handlers/types'
import { XpertAgentSubgraphCommand } from '../../commands/subgraph.command'
import { CreateWNIteratingCommand } from '../create-wn-iterating.command'
import { STATE_VARIABLE_ITERATING_OUTPUT, STATE_VARIABLE_ITERATING_OUTPUT_STR } from '../iterating'

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
				await this.i18nService.translate('xpert.Error.NoChildNodeForLoop', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}
		const agentNode = graph.nodes.find(
			(n) => n.type === 'agent' && n.key === connections[0].to
		) as TXpertTeamNode & { type: 'agent' }

		const entity = node.entity as IWFNIterating
		const inputVariable = entity.inputVariable
		const inputParams = entity.inputParams
		const outputParams = entity.outputParams

		const execution = {}
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
					execution,
					subscriber,
					disableCheckpointer: true,
					channel: channelName(agentNode.key),
					partners: []
				}
			)
		)

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
						const _state = {...state, ...item}
						const inputs = inputParams.reduce((acc, curr) => {
							setStateVariable(acc, curr.variable, get(_state, curr.name))
							return acc
						}, {})

						const itemExecution: IXpertAgentExecution = {
							xpert: { id: xpertId } as IXpert,
							agentKey: node.key,
							inputs: item,
							title: entity.title,
							parentId: executionId
						}

						return await wrapAgentExecution(
							async () => {
								const subAgentExecution = {
									xpert: { id: xpertId } as IXpert,
									agentKey: agent.key,
									inputs: inputs,
									parentId: itemExecution.id
								}
		
								const retState = await wrapAgentExecution(
									async () => {
										const retState = await subgraph.invoke(
											{
												[STATE_VARIABLE_INPUT]: state[STATE_VARIABLE_INPUT],
												[STATE_VARIABLE_SYS]: state[STATE_VARIABLE_SYS],
												...inputs
											},
											{
												...config,
												signal: controller.signal,
												configurable: {
													...config.configurable,
													executionId: itemExecution.id
												}
											}
										)
		
										const outputItem = outputParams.reduce((acc, curr) => {
											acc[curr.name] = get(retState, curr.variable)
											return acc
										}, {})
										const output = retState[channelName(agentNode.key)].output
		
										return {
											state: outputItem,
											output
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
									state: retState
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
							[STATE_VARIABLE_ITERATING_OUTPUT_STR]: outputs.map((_) => JSON.stringify(_, null, 2))
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
}
