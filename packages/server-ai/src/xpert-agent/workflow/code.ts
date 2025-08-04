import { RunnableLambda } from '@langchain/core/runnables'
import { END } from '@langchain/langgraph'
import {
	workflowNodeIdentifier,
	channelName,
	IEnvironment,
	IWFNCode,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { get, isNil } from 'lodash'
import { SandboxVMCommand } from '../../sandbox'
import { AgentStateAnnotation, nextWorkflowNodes, stateWithEnvironment } from '../../shared'
import { wrapAgentExecution } from '../../shared/agent/execution'

const ErrorChannelName = 'error'
const LogsChannelName = 'logs'

export function createCodeNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
	}
) {
	const { commandBus, queryBus, environment } = params
	const entity = node.entity as IWFNCode

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				const inputs = entity.inputs.reduce((acc, param) => {
					if (!param.variable) {
						throw new Error(`Input variable for "${param.name}" in Code node "${workflowNodeIdentifier(node.entity)}" is not defined`)
					}
					acc[param.name] = get(stateEnv, param.variable)
					return acc
				}, {})

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.CODE,
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
						let results = null
						let tryCount = 0
						const maxRetry = entity.retry?.enabled ? (entity.retry.stopAfterAttempt ?? 1) : 0
						while (tryCount <= maxRetry) {
							tryCount++
							try {
								results = await commandBus.execute(
									new SandboxVMCommand(entity.code, inputs, null, entity.language)
								)
							} catch (err) {
								if (tryCount > maxRetry) {
									if (entity.errorHandling?.type === 'defaultValue') {
										return {
											state: {
												[channelName(node.key)]: entity.errorHandling.defaultValue
											},
											output: entity.errorHandling.defaultValue
										}
									}
									if (entity.errorHandling?.type === 'failBranch') {
										return {
											state: {
												[channelName(node.key)]: {
													[ErrorChannelName]: getErrorMessage(err)
												}
											},
											output: {
												[ErrorChannelName]: getErrorMessage(err)
											}
										}
									}
									throw err
								}

								await new Promise((resolve) =>
									setTimeout(resolve, (entity.retry?.retryInterval ?? 1) * 1000)
								)
							}
						}

						// Check the result type
						const result = results.result
						if (typeof result === 'object' && entity.outputs) {
							entity.outputs.forEach((output) => {
								const type = isNil(result[output.name]) ? 'nil' : typeof result[output.name]
								switch (output.type) {
									case XpertParameterTypeEnum.STRING: {
										if (type !== 'string') {
											throw new Error(
												`Output variable "${output.name}" expects a string, but received: ${type}`
											)
										}
										break
									}
									case XpertParameterTypeEnum.NUMBER: {
										if (type !== 'number') {
											throw new Error(
												`Output variable "${output.name}" expects a number, but received: ${type}`
											)
										}
										break
									}
									case XpertParameterTypeEnum.BOOLEAN: {
										if (type !== 'boolean') {
											throw new Error(
												`Output variable "${output.name}" expects a boolean, but received: ${type}`
											)
										}
										break
									}
									case XpertParameterTypeEnum.OBJECT: {
										if (type !== 'object') {
											throw new Error(
												`Output variable "${output.name}" expects an object, but received: ${type}`
											)
										}
										break
									}
									case XpertParameterTypeEnum.ARRAY_STRING: {
										if (!Array.isArray(result[output.name]) || !result[output.name].every((item) => typeof item === 'string')) {
											throw new Error(
												`Output variable "${output.name}" expects an array of strings`
											)
										}
										break
									}
									case XpertParameterTypeEnum.ARRAY: {
										if (!Array.isArray(result[output.name])) {
											throw new Error(
												`Output variable "${output.name}" expects an array of objects, but received: ${type}`
											)
										}
										break
									}
								}
							})
						}

						return {
							state: {
								[channelName(node.key)]: {
									...(typeof results?.result === 'object' ? results.result : { result: results?.result }),
									[LogsChannelName]: results?.logs
								}
							},
							output: results?.result
						}
					},
					{
						commandBus: commandBus,
						queryBus: queryBus,
						subscriber: subscriber,
						execution
					}
				)()
			}),
			ends: []
		},
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			if (state[channelName(node.key)][ErrorChannelName]) {
				return (
					graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
					END
				)
			}

			return nextWorkflowNodes(graph, node.key, state)
		}
	}
}

export function codeOutputVariables(entity: IWorkflowNode) {
	return [
		...((<IWFNCode>entity).outputs ?? []),
		{
			type: XpertParameterTypeEnum.STRING,
			name: ErrorChannelName,
			title: 'Error',
			description: {
				en_US: 'Error info',
				zh_Hans: '错误信息'
			}
		},
		{
			type: XpertParameterTypeEnum.STRING,
			name: LogsChannelName,
			title: 'Logs',
			description: {
				en_US: 'Logs info',
				zh_Hans: '日志信息'
			}
		}
	]
}
