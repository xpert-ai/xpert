import { TXpertGraph, TXpertTeamNode, WorkflowNodeTypeEnum } from "@metad/contracts"
import { createCasesNode } from "./cases"
import { createSplitterNode } from "./splitter"
import { AgentStateAnnotation } from "../commands/handlers/types";
import { createIteratingNode } from "./iterating";

export function createWorkflowNode(graph: TXpertGraph, node: TXpertTeamNode & { type: 'workflow' }): {
	workflowNode: {graph: any; ends: string[]};
	navigator: (state: typeof AgentStateAnnotation.State, config) => Promise<string[]>;
	nextNodes: TXpertTeamNode[]
} {
	let workflow = {} as any
	switch(node.entity.type) {
		case (WorkflowNodeTypeEnum.IF_ELSE): {
			workflow = createCasesNode(graph, node)
			break
		}
		case (WorkflowNodeTypeEnum.ITERATING): {
			workflow = createIteratingNode(graph, node)
			break
		}
		case (WorkflowNodeTypeEnum.SPLITTER): {
			workflow = createSplitterNode(graph, node)
			break
		}
	}

	return {
		...workflow,
		nextNodes: graph.connections
			.filter((_) => _.type === 'edge' && _.from.startsWith(node.key))
			.map((conn) => graph.nodes.find((_) => (_.type === 'agent' || _.type === 'workflow') && _.key === conn.to))
	}
}
