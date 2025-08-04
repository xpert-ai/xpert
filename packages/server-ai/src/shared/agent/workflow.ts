import { END, Send } from '@langchain/langgraph'
import { agentUniqueName, IXpert, TXpertAgentConfig, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { Subscriber } from 'rxjs'

export function nextWorkflowNodes(graph: TXpertGraph, from: string, state: any) {
	const connections = graph.connections.filter((conn) => conn.type === 'edge' && conn.from === from)
	if (connections.length > 1) {
		return connections.map((conn) => new Send(conn.to, state))
	} else if (connections.length === 1) {
		return connections[0].to
	}
	return END
}

// export async function createXpertSubworkflow(node: TXpertTeamNode, parentKey: string, params: {
// 	agentKeys: Set<string>
// 	interruptBefore: string[]
// 	mute: TXpertAgentConfig['mute']
// 	xpert: IXpert
// 	isDraft: boolean
// 	subscriber: Subscriber<any>
// 	thread_id?: string
// 	rootController?: AbortController
// 	signal?: AbortSignal
// }) {
// 	const { agentKeys, interruptBefore, mute, xpert, isDraft, subscriber, thread_id, rootController, signal } = params

// 	if (node?.type === 'agent') {
// 		if (agentKeys.has(node.key)) {
// 			return
// 		}
// 		agentKeys.add(node.key)
// 		// Is sensitive node
// 		if (xpert.agentConfig?.interruptBefore?.includes(agentUniqueName(node.entity))) {
// 			interruptBefore.push(node.key)
// 		}
// 		const { stateGraph, nextNodes, failNode } = await this.createAgentSubgraph(node.entity, {
// 			mute,
// 			xpert,
// 			options: {
// 				leaderKey: parentKey,
// 				isDraft,
// 				subscriber
// 			},
// 			thread_id,
// 			rootController,
// 			signal,
// 			isTool: false,
// 			// variables: toolsetVarirables,
// 			// partners
// 		})

// 		// Conditional Edges
// 		const ends = []
// 		if (failNode) {
// 			ends.push(failNode.key)
// 			await createXpertSubworkflow(failNode)
// 		}

// 		nodes[node.key] = { graph: stateGraph, ends }
// 		if (nextNodes?.length) {
// 			// One2many edge or one2one
// 			if (nextNodes?.length > 1) {
// 				conditionalEdges[node.key] = [
// 					(state) => {
// 						return nextNodes.filter((_) => !!_).map(({ key }) => new Send(key, state))
// 					},
// 					nextNodes.map(({ key }) => key)
// 				]
// 			} else if (nextNodes?.[0]?.key) {
// 				edges[node.key] = nextNodes[0].key
// 			}
// 			for await (const nextNode of nextNodes) {
// 				await createSubgraph(nextNode, null)
// 			}
// 		} else {
// 			edges[node.key] = END
// 		}
// 	} else if (node?.type === 'workflow') {
// 		if (nodes[node.key]) {
// 			return
// 		}
// 		const { workflowNode, navigator, nextNodes, channel } = await this.commandBus.execute(
// 			new CreateWorkflowNodeCommand(xpert.id, graph, node, parentKey, {
// 				mute,
// 				isDraft: options.isDraft,
// 				subscriber,
// 				environment,
// 				xpert: team
// 			})
// 		)
// 		if (channel) {
// 			channels.push(channel)
// 		}
// 		nodes[node.key] = {
// 			...workflowNode
// 		}
// 		const workflowNodeEnds = [...nextNodes.map((n) => n.key)]
// 		if (!nextNodes.length) {
// 			workflowNodeEnds.push(END)
// 		}
// 		conditionalEdges[node.key] = [navigator, workflowNodeEnds]
// 		for await (const nNode of nextNodes ?? []) {
// 			await createSubgraph(nNode, null)
// 		}
// 	}
// }
