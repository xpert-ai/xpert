import { END, Send } from '@langchain/langgraph'
import { TXpertGraph } from '@metad/contracts'

export function nextWorkflowNodes(graph: TXpertGraph, from: string, state: any) {
	const connections = graph.connections.filter((conn) => conn.type === 'edge' && conn.from === from)
	if (connections.length > 1) {
		return connections.map((conn) => new Send(conn.to, state))
	} else if (connections.length === 1) {
		return connections[0].to
	}
	return END
}
