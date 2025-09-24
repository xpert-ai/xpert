import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END } from '@langchain/langgraph'
import {
    channelName,
    IEnvironment,
    IWFNChunker,
    IWFNUnderstanding,
    TAgentRunnableConfigurable,
    TXpertGraph,
    TXpertTeamNode,
    XpertParameterTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AgentStateAnnotation, nextWorkflowNodes, stateWithEnvironment } from '../../../shared'

const ErrorChannelName = 'error'
const LogsChannelName = 'logs'

export function createUnderstandingNode(
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
    const entity = node.entity as IWFNUnderstanding

    return {
        workflowNode: {
            graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
                const configurable: TAgentRunnableConfigurable = config.configurable
                const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
                const stateEnv = stateWithEnvironment(state, environment)

                return {
                    [channelName(node.key)]: {
                    }
                }
            }),
            ends: []
        },
        channel: {
            name: channelName(node.key),
            annotation: Annotation<Record<string, unknown>>({
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

export function understandingOutputVariables(entity: IWFNUnderstanding) {
    return [
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
