import { Runnable, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import { END, Send } from '@langchain/langgraph'
import { TVariableAssigner, TXpertGraph } from '@metad/contracts'

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
	tool: StructuredToolInterface | RunnableToolLike
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
	navigator?
	nextNodes?
	channel?
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
