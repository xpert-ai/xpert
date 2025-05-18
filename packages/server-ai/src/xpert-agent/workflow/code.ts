import { RunnableLambda } from '@langchain/core/runnables'
import { END } from '@langchain/langgraph'
import { channelName, IWFNCode, IXpert, IXpertAgentExecution, TAgentRunnableConfigurable, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { get } from 'lodash'
import { SandboxVMCommand } from '../../sandbox'
import { wrapAgentExecution } from '../../xpert-agent-execution/utils'
import { AgentStateAnnotation } from '../../shared'

const ErrorChannelName = 'error'

export function createCodeNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus,
		queryBus: QueryBus,
		xpertId: string,
		rootExecutionId: string,
	}
) {
	const { commandBus, queryBus, xpertId, rootExecutionId } = params
	const entity = node.entity as IWFNCode

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber } = configurable

				const inputs = entity.inputs.reduce((acc, param) => {
					acc[param.name] = get(state, param.variable)
					return acc
				}, {})

				const execution: IXpertAgentExecution = {
					// xpert: { id: xpertId } as IXpert,
					inputs: inputs,
					parentId: rootExecutionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						let tryCount = 0
						const maxRetry = entity.retry?.enabled ? (entity.retry.stopAfterAttempt ?? 1) : 0
						while (tryCount <= maxRetry) {
							tryCount++
							try {
								const results = await commandBus.execute(
									new SandboxVMCommand(entity.code, inputs, null, entity.language)
								)
								return {
									state: {
										[channelName(node.key)]: results ?? {}
									}
								}
							} catch (err) {
								if (tryCount > maxRetry) {
									if (entity.errorHandling?.type === 'defaultValue') {
										return {
											state: {
												[channelName(node.key)]: entity.errorHandling.defaultValue
											}
										}
									}
									if (entity.errorHandling?.type === 'failBranch') {
										return {
											state: {
												[channelName(node.key)]: {
													[ErrorChannelName]: getErrorMessage(err)
												}
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
						return {
							state: {}
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
			return graph.connections.find((conn) => conn.type === 'edge' && conn.from === node.key)?.to ?? END
		}
	}
}
