import { TXpertGraph, TXpertTeamNode, WorkflowNodeTypeEnum } from "@metad/contracts"
import { createCasesNode } from "./cases"
import { createSplitterNode } from "./splitter"

export function createWorkflowNode(graph: TXpertGraph, node: TXpertTeamNode & { type: 'workflow' }) {
	let workflowNode = null

	if (node.entity.type === WorkflowNodeTypeEnum.IF_ELSE) {
		workflowNode = createCasesNode(graph, node)
	} else if (node.entity.type === WorkflowNodeTypeEnum.SPLITTER) {
		workflowNode = createSplitterNode(graph, node)
	}

	return {
		workflowNode,
		nextNodes: graph.connections
			.filter((_) => _.type === 'edge' && _.from.startsWith(node.key))
			.map((conn) => graph.nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to))
	}
}
