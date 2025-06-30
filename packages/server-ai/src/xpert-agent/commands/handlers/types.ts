import { Runnable, RunnableLike, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import {
	IXpertAgent,
	TVariableAssigner,
	TXpertGraph,
	TXpertTeamNode,
} from '@metad/contracts'
import { AgentStateAnnotation } from '../../../shared'

export type TSubAgent = {
	name: string
	tool: StructuredToolInterface | RunnableToolLike
	node?: RunnableLike<typeof AgentStateAnnotation> | Runnable
	stateGraph?: Runnable
	nextNodes?: TXpertTeamNode[]
	failNode?: TXpertTeamNode
}

export function parseXmlString(content: string) {
	return content?.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export type TGraphTool = {
	caller: string
	toolset: {
		provider: string
		title: string
		id?: string
	}
	tool: StructuredToolInterface | RunnableToolLike
	variables?: TVariableAssigner[]
}

export function allAgentsKey(graph: TXpertGraph): IXpertAgent[] {
	return graph.nodes.filter((n) => n.type === 'agent').map((_) => _.entity as IXpertAgent)
}

export function identifyAgent(agent: IXpertAgent) {
	return {
		id: agent.id,
		key: agent.key,
		name: agent.name,
		title: agent.title,
		description: agent.description,
		avatar: agent.avatar
	}
}
