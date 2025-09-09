import { Runnable } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { TXpertTeamNode } from '@metad/contracts'

/**
 * 
 * @experiment Interface for SubAgent
 */
export interface IXpertSubAgent {
	name: string
	tool: DynamicStructuredTool
	nextNodes: TXpertTeamNode[]
	failNode: TXpertTeamNode
	stateGraph: Runnable<any, any, LangGraphRunnableConfig>
}
