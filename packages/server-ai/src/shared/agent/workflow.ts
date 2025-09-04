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

export type TWorkflowGraphNode = TGraphTool & {
	workflowNode: {
		name?: string;
		graph: Runnable;
		ends: string[]
	}
	navigator?: RunnableLike
	nextNodes?: TXpertTeamNode[]
	channel?: TStateChannel
}

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