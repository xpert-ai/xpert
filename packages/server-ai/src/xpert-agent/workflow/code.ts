import { RunnableLambda } from '@langchain/core/runnables'
import { END } from '@langchain/langgraph'
import { channelName, IWFNCode, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { CommandBus } from '@nestjs/cqrs'
import { get } from 'lodash'
import { SandboxVMCommand } from '../../sandbox'
import { AgentStateAnnotation } from '../commands/handlers/types'

const ErrorChannelName = 'error'

export function createCodeNode(
	commandBus: CommandBus,
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' }
) {
	const entity = node.entity as IWFNCode

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state, config) => {
				const inputs = entity.inputs.reduce((acc, param) => {
					acc[param.name] = get(state, param.variable)
					return acc
				}, {})

				let tryCount = 0
				const maxRetry = entity.retry?.enabled ? (entity.retry.stopAfterAttempt ?? 1) : 0
				while (tryCount <= maxRetry) {
					tryCount++
					try {
						const results = await commandBus.execute(new SandboxVMCommand(entity.code, inputs))
						return {
							[channelName(node.key)]: results ?? {}
						}
					} catch (err) {
						if (tryCount > maxRetry) {
							if (entity.errorHandling?.type === 'defaultValue') {
								return {
									[channelName(node.key)]: entity.errorHandling.defaultValue
								}
							}
							if (entity.errorHandling?.type === 'failBranch') {
								return {
									[channelName(node.key)]: {
										[ErrorChannelName]: getErrorMessage(err)
									}
								}
							}
							throw err
						}
						
						await new Promise(resolve => setTimeout(resolve, (entity.retry?.retryInterval ?? 1) * 1000))
					}
				}
				
			}),
			ends: []
		},
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			if (state[channelName(node.key)][ErrorChannelName]) {
				return (
					graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)
						?.to ?? END
				)
			}
			return graph.connections.find((conn) => conn.type === 'edge' && conn.from === node.key)?.to ?? END
		}
	}
}
