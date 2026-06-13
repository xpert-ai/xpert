import { IEnvironment, IWorkflowNode, TXpertGraph, TXpertTeamNode } from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { TWorkflowGraphNode } from '../../../shared'
import {
    agentToolOutputVariables as pluginAgentToolOutputVariables,
    createWorkflowAgentToolNode,
    WORKFLOW_AGENT_TOOL_ARGS_CHANNEL
} from '../../plugins/agent-tool'
import type { TWorkflowAgentToolState } from '../../plugins/agent-tool'

export { WORKFLOW_AGENT_TOOL_ARGS_CHANNEL }
export type { TWorkflowAgentToolState }

/**
 * @deprecated Use WorkflowAgentWorkflowNodeStrategy from xpert-agent/plugins/agent-tool instead.
 */
export function createAgentToolNode(
    graph: TXpertGraph,
    node: TXpertTeamNode & { type: 'workflow' },
    params: {
        leaderKey: string
        commandBus: CommandBus
        queryBus: QueryBus
        xpertId: string
        environment: IEnvironment
        conversationId: string
    }
) {
    const result = createWorkflowAgentToolNode(graph, node, {
        leaderKey: params.leaderKey,
        commandBus: params.commandBus,
        queryBus: params.queryBus,
        environment: params.environment
    })
    const workflowNode: TWorkflowGraphNode = {
        workflowNode: {
            name: result.name,
            graph: result.graph,
            ends: result.ends
        },
        channel: result.channel,
        navigator: result.navigator,
        caller: result.caller,
        toolset: result.toolset,
        tool: result.tool,
        variables: result.variables
    }
    return workflowNode
}

/**
 * @deprecated Use WorkflowAgentWorkflowNodeStrategy.outputVariables from xpert-agent/plugins/agent-tool instead.
 */
export function agentToolOutputVariables(entity: IWorkflowNode) {
    return pluginAgentToolOutputVariables(entity)
}
