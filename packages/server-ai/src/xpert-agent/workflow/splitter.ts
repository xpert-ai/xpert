// import { RunnableLambda } from "@langchain/core/runnables";
// import { END } from "@langchain/langgraph";
// import { IWFNSplitter, TXpertGraph, TXpertTeamNode } from "@metad/contracts";
// import { AgentStateAnnotation } from "../../shared";

// export function createSplitterNode(graph: TXpertGraph, node: TXpertTeamNode & { type: 'workflow' }) {
// 	const entity = node.entity as IWFNSplitter

// 	return {
// 		workflowNode: {
// 			graph: RunnableLambda.from((state) => {
// 				console.log(state, entity)
// 			}),
// 			ends: []
// 		},
// 		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
// 			return END
// 		}
// 	}
// }