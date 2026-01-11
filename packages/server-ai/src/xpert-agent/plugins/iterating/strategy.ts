import { RunnableLambda } from '@langchain/core/runnables'
import { CompiledStateGraph } from '@langchain/langgraph'
import {
	channelName,
	getVariableSchema,
	IEnvironment,
	IteratingIndexParameterName,
	IteratingItemParameterName,
	IWFNIterating,
	IWorkflowNode,
	IXpert,
	IXpertAgent,
	IXpertAgentExecution,
	setStateVariable,
	TAgentRunnableConfigurable,
	TWorkflowVarGroup,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { compact, get, isString } from 'lodash'
import { AgentStateAnnotation, stateToParameters } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { CompileGraphCommand } from '../../commands'
import { XpertAgentSubgraphCommand } from '../../commands/subgraph.command'

const PARALLEL_MAXIMUM = 2
export const STATE_VARIABLE_ITERATING_OUTPUT = 'output'
export const STATE_VARIABLE_ITERATING_OUTPUT_STR = 'output_str'

export function iteratingOutputVariables(iterating: IWFNIterating) {
	return [
		{
			name: STATE_VARIABLE_ITERATING_OUTPUT,
			type: iterating.outputParams?.length ? XpertParameterTypeEnum.ARRAY : XpertParameterTypeEnum.STRING,
			item:
				iterating.outputParams?.map((item) => ({
					...item,
					type: item.type || XpertParameterTypeEnum.STRING
				})) ?? [],
			description: {
				en_US: 'Structured data sequence',
				zh_Hans: '结构化数据序列'
			}
		},
		{
			name: STATE_VARIABLE_ITERATING_OUTPUT_STR,
			type: XpertParameterTypeEnum.ARRAY_STRING,
			description: {
				en_US: 'Serialized data sequence',
				zh_Hans: '序列化数据序列'
			}
		}
	]
}

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.ITERATING)
export class WorkflowIteratingNodeStrategy implements IWorkflowNodeStrategy {
	readonly #logger = new Logger(WorkflowIteratingNodeStrategy.name)

	@Inject(CommandBus)
	private readonly commandBus: CommandBus

	@Inject(QueryBus)
	private readonly queryBus: QueryBus

	readonly meta = {
		name: WorkflowNodeTypeEnum.ITERATING,
		label: {
			en_US: 'Iterating',
			zh_Hans: '迭代'
		},
		icon: null,
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

	async create(payload: {
		graph: TXpertGraph
		node: TXpertTeamNode & { type: 'workflow' }
		xpertId: string
		environment: IEnvironment
		isDraft: boolean
	}) {
		const { xpertId, graph, node, isDraft, environment } = payload

		const entity = node.entity as IWFNIterating

		// Get the only child agent node
		const connections = graph.connections.filter(
			(conn) => (conn.type === 'agent' || conn.type === 'xpert') && conn.from === node.key
		)
		if (connections.length > 1) {
			throw new InternalServerErrorException(this.translate('xpert.Error.MultiNodeNotSupported', entity))
		}
		if (connections.length < 1) {
			throw new InternalServerErrorException(this.translate('xpert.Error.NoChildNodeForLoop', entity))
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
			throw new InternalServerErrorException(this.translate('xpert.Error.InputParamsRequired', entity))
		}

		if (!outputParams?.length) {
			throw new InternalServerErrorException(this.translate('xpert.Error.OutputParamsRequired', entity))
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
				new CompileGraphCommand(agentKey, { id: _xpertId }, {
					isDraft,
					// mute: command.options.mute,
					// store: command.options.store,
					execution,
					rootController: abortController,
					signal: abortController.signal,
					// subscriber,
					environment
				} as any)
			)
			subgraph = compiled.graph
		} else {
			const compiled = await this.commandBus.execute<
				XpertAgentSubgraphCommand,
				{ agent: IXpertAgent; graph: CompiledStateGraph<any, any, any> }
			>(
				new XpertAgentSubgraphCommand(agentKey, { id: _xpertId }, {
					isDraft,
					// mute: command.options.mute,
					// store: command.options.store,
					isStart: true,
					rootController: abortController,
					signal: abortController.signal,
					execution,
					// subscriber,
					disableCheckpointer: true, // The loop node cannot record the execution log correctly, so the Checkpointer is temporarily disabled.
					channel: channelName(agentKey),
					partners: [],
					environment
				} as any)
			)
			subgraph = compiled.graph
		}

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { subscriber, executionId } = configurable
				const stateEnv = stateToParameters(state, environment)
				const parameterValue = get(state, inputVariable)

				const parallel = entity.parallel
				const maximum = entity.maximum ?? PARALLEL_MAXIMUM
				const errorMode = entity.errorMode
				const invokeSubgraph = async (item, index: number) => {
					const originalState = isString(item)
						? { [IteratingIndexParameterName]: index, [IteratingItemParameterName]: item }
						: { ...(item ?? {}), [IteratingIndexParameterName]: index, [IteratingItemParameterName]: item }
					let inputs = {}
					const _state = { ...state, ...originalState }
					inputs = inputParams.reduce((acc, curr) => {
						setStateVariable(acc, curr.variable, get(_state, curr.name))
						return acc
					}, inputs)

					const itemExecution: IXpertAgentExecution = {
						category: 'workflow',
						type: WorkflowNodeTypeEnum.ITERATING,
						// xpert: { id: xpertId } as IXpert,
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
						[STATE_VARIABLE_ITERATING_OUTPUT_STR]: outputs
							?.map((_) => (typeof _ === 'string' ? _ : JSON.stringify(_, null, 2)))
							.join('\n')
					}
				}
			}),
			ends: []
		}
	}

	inputVariables(entity: IWorkflowNode, variables?: TWorkflowVarGroup[]): TXpertParameter[] {
		const node = entity as IWFNIterating
		const itemSchema = resolveItemSchema(node.inputVariable, variables)

		return [
			{
				name: IteratingIndexParameterName,
				type: XpertParameterTypeEnum.NUMBER,
				description: {
					en_US: 'Current index',
					zh_Hans: '当前索引'
				}
			},
			{
				name: IteratingItemParameterName,
				type: itemSchema.type,
				item: itemSchema.item,
				description: {
					en_US: 'Current item',
					zh_Hans: '当前项'
				}
			}
		]
	}

	outputVariables(entity: IWorkflowNode): TXpertParameter[] {
		return iteratingOutputVariables(entity as IWFNIterating)
	}

	translate(key: string, options): string {
		return t(key, { ns: 'server-ai', ...options }) as string
	}
}

function resolveItemSchema(
	inputVariable: string,
	variables?: TWorkflowVarGroup[]
): { type: XpertParameterTypeEnum; item?: TXpertParameter[] } {
	if (!inputVariable || !variables?.length) {
		return { type: XpertParameterTypeEnum.STRING }
	}

	const schema = getVariableSchema(variables, inputVariable).variable
	if (!schema?.type) {
		return { type: XpertParameterTypeEnum.STRING }
	}

	const typeValue = String(schema.type)
	const match = typeValue.match(/^array\[(.+)\]$/)
	if (match) {
		const rawType = match[1]
		if (rawType === XpertParameterTypeEnum.OBJECT && schema.item?.length) {
			return { type: XpertParameterTypeEnum.OBJECT, item: schema.item }
		}
		return { type: rawType as XpertParameterTypeEnum }
	}

	if (schema.type === XpertParameterTypeEnum.ARRAY) {
		return { type: XpertParameterTypeEnum.OBJECT, item: schema.item }
	}

	return { type: XpertParameterTypeEnum.STRING }
}
