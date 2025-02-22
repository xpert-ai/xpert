import { IWFNSplitter, TXpertGraph, TXpertTeamNode } from "@metad/contracts";
import { AgentStateAnnotation } from "../commands/handlers/types";
import { END } from "@langchain/langgraph";

export function createSplitterNode(graph: TXpertGraph, node: TXpertTeamNode & { type: 'workflow' }) {
	const entity = node.entity as IWFNSplitter

    return async (state: typeof AgentStateAnnotation.State, config) => {

		return END
	}
}