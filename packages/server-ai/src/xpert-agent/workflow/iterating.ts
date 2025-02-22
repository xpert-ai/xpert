import { IWFNIterating, TXpertGraph, TXpertTeamNode } from "@metad/contracts";
import { AgentStateAnnotation } from "../commands/handlers/types";
import { END } from "@langchain/langgraph";

export function createIteratingNode(graph: TXpertGraph, node: TXpertTeamNode & { type: 'workflow' }) {
	const entity = node.entity as IWFNIterating

	return {
		workflowNode: {
			graph: (state) => {
				console.log(state, entity)

			},
			ends: []
		},
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			return END
		}
	}
}