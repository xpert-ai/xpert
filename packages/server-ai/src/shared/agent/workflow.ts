import { Runnable, RunnableLike, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface, DynamicStructuredTool } from '@langchain/core/tools'
import { END, Send } from '@langchain/langgraph'
import { ToolInputSchemaBase } from '@langchain/core/dist/tools/types'
import { InteropZodType } from '@langchain/core/utils/types'
import { TVariableAssigner, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { TStateChannel } from './state'

/**
 * Intermediate communication type of creating tools
 */
export type TGraphTool = {
	/**
	 * Agent who is calling the tool
	 */
	caller: string
	/**
	 * Toolset info
	 */
	toolset: {
		provider: string
		title: string
		id?: string
	}
	/**
	 * Tool definition
	 */
	tool?: DynamicStructuredTool<ToolInputSchemaBase, any, any> | StructuredToolInterface<ToolInputSchemaBase, any, any> | RunnableToolLike<InteropZodType, unknown>
	/**
	 * Variables
	 */
	variables?: TVariableAssigner[]
	/**
	 * Subgraph node for the tool, otherwise use tool itself
	 */
	graph?: Runnable
}

export type TWorkflowGraphNode = Partial<TGraphTool> & {
	workflowNode: {
		name?: string;
		graph: Runnable;
		ends: string[]
	}
	navigator?: RunnableLike
	nextNodes?: TXpertTeamNode[]
	channel?: TStateChannel
}

/**
 * @deprecated `Send` objects array have problems with concurrent execution and need to be changed to fixed edges
 */
export function nextWorkflowNodes(graph: TXpertGraph, from: string, state: any) {
	const connections = graph.connections.filter((conn) => conn.type === 'edge' && conn.from === from)
	if (connections.length > 1) {
		return connections.map((conn) => new Send(conn.to, state))
	} else if (connections.length === 1) {
		return connections[0].to
	}
	return END
}

/**
 * Does the workflow node have multiple inputs
 *
 * @param graph Workflow graph
 * @param nodeKey Node key
 * @returns
 */
export function hasMultipleInputs(graph: TXpertGraph, nodeKey: string) {
	const connections = graph.connections.filter((conn) => conn.type === 'edge' && conn.to === nodeKey)
	return connections.length > 1
}

export function orderNodesByKeyOrder(nodes: TXpertTeamNode[], order: string[]): TXpertTeamNode[] {
    if (!order?.length) {
        return nodes
    }
    const orderMap = order.reduce((acc, key, index) => {
        acc[key] = index
        return acc
    }, {} as Record<string, number>)

    return nodes.sort((a, b) => {
        const aIndex = orderMap[a.key] ?? Number.MAX_SAFE_INTEGER
        const bIndex = orderMap[b.key] ?? Number.MAX_SAFE_INTEGER
        return aIndex - bIndex
    })
}