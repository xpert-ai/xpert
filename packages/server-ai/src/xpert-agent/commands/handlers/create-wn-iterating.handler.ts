import { CompiledStateGraph, END, LangGraphRunnableConfig, Send } from '@langchain/langgraph'
import { RunnableLambda } from '@langchain/core/runnables'
import { RequestContext } from '@metad/server-core'
import { channelName, ChatMessageEventTypeEnum, ChatMessageTypeEnum, IWFNIterating, IXpert, IXpertAgent, mapTranslationLanguage, TXpertTeamNode, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { compact, get } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { CreateWNIteratingCommand } from '../create-wn-iterating.command'
import { AgentStateAnnotation } from './types'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { setStateVariable } from '../../agent'
import { XpertAgentVariableSchemaQuery } from '../../queries'

@CommandHandler(CreateWNIteratingCommand)
export class CreateWNIteratingHandler implements ICommandHandler<CreateWNIteratingCommand> {
	readonly #logger = new Logger(CreateWNIteratingHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService,
	) {}

	public async execute(command: CreateWNIteratingCommand) {
		const { xpertId, graph, node, options } = command
		const { subscriber, isDraft } = options

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
		const agentNode = graph.nodes.find((n) => n.type === 'agent' && n.key === connections[0].to) as TXpertTeamNode & {type: 'agent'}

		const entity = node.entity as IWFNIterating
		const inputVariable = entity.inputVariable
		const outputVariable = entity.outputVariable
		let paramSchema = null
		
		if (inputVariable) {
			const variableSchema = await this.queryBus.execute(new XpertAgentVariableSchemaQuery({
				xpertId,
				type: 'workflow',
				isDraft,
				variable: inputVariable
			}))
			if (variableSchema?.type.startsWith('array')) {
				paramSchema = variableSchema.item
			}
			// const leaderAgent = graph.nodes.find((n) => n.type === 'agent' && channelName(n.key) === agentChannelName) as TXpertTeamNode & {type: 'agent'}
			// if (leaderAgent) {
			// 	const variableSchema = leaderAgent.entity.outputVariables.find((_) => _.name === variableName)
			// 	if (variableSchema.type.startsWith('array')) {
			// 		paramSchema = variableSchema.item
			// 	}
			// }
		}

		const execution = {}
		const abortController = new AbortController()
		// Create graph by command
		const { agent, graph: subgraph } = await this.commandBus.execute<XpertAgentSubgraphCommand, {agent: IXpertAgent; graph: CompiledStateGraph<any, any, any>}>(
			new XpertAgentSubgraphCommand(agentNode.key, {id: xpertId}, {
				isDraft,
				isStart: true,
				rootController: abortController,
				signal: abortController.signal,
				execution,
				subscriber,
				disableCheckpointer: true,
				variables: paramSchema
			})
		)

		return {
			workflowNode: {
				graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config: LangGraphRunnableConfig) => {
					const parameterValue = get(state, entity.inputVariable)
					let _execution = {
						...execution,
						threadId: config.configurable.thread_id,
						checkpointNs: config.configurable.checkpoint_ns
					}

					// Record start time
					const timeStart = Date.now()
					_execution = await this.commandBus.execute(
						new XpertAgentExecutionUpsertCommand({
							...execution,
							xpert: { id: xpertId } as IXpert,
							agentKey: agent.key,
							inputs: parameterValue,
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
					
					const controller = new AbortController()
					config.signal.addEventListener('abort', () => {
						if (!controller.signal.aborted) {
							try {
								controller.abort()
							} catch(err) {}
						}
					})
					const parallel = entity.parallel
					const maximum = entity.maximum
					const errorMode = entity.errorMode
					let outputs = null
					if (Array.isArray(parameterValue)) {
						outputs = new Array(parameterValue.length).fill(null);
						if (parallel) {
							// Execute in parallel with a maximum concurrency limit using a task pool
							const taskPool = new Set();
							let index = 0
							for await (const item of parameterValue) {
								const i = index
								// If the task pool is full, wait for one task to complete
								if (taskPool.size >= maximum) {
									await Promise.race(taskPool)
								}

								// Create a new task and add it to the pool
								const task = subgraph.invoke({ ...state, ...item }, { ...config, signal: controller.signal })
									.then(retState => {
										outputs[i] = retState[channelName(agentNode.key)].output
									})
									.catch((err) => {
										switch(errorMode) {
											case ('terminate'): {
												throw err
											}
											case ('ignore'): {
												this.#logger.error(err)
												break
											}
											case ('remove'): {
												this.#logger.error(err)
												break
											}
										}
									})
									.finally(() => {
										// Remove the task from the pool once it completes
										taskPool.delete(task)
									});

								taskPool.add(task);
								index++
							}

							// Wait for all remaining tasks to complete
							await Promise.all(taskPool);
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
									const retState = await subgraph.invoke({ ...state, ...item }, { ...config, signal: controller.signal })
									outputs[i] = retState[channelName(agentNode.key)].output
								} catch(err) {
									switch(errorMode) {
										case ('terminate'): {
											throw err
										}
										case ('ignore'): {
											this.#logger.error(err)
											break
										}
										case ('remove'): {
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

					const status = XpertAgentExecutionStatusEnum.SUCCESS
					const error = null
					const finalize = async () => {
						const timeEnd = Date.now()
						// Record End time
						const newExecution = await this.commandBus.execute(
							new XpertAgentExecutionUpsertCommand({
								..._execution,
								checkpointId: config.configurable.checkpoint_id,
								elapsedTime: timeEnd - timeStart,
								status,
								error,
								outputs: {
									output: outputs
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

					await finalize()

					const nState = {}
					if (outputVariable) {
						setStateVariable(nState, outputVariable, outputs)
					}
					return nState
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
