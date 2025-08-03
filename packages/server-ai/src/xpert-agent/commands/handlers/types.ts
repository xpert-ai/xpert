import { Runnable, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import {
	IXpertAgent,
	TXpertGraph,
	TXpertTeamNode,
} from '@metad/contracts'

export type TSubAgent = {
	name: string
	tool: StructuredToolInterface | RunnableToolLike
	// node?: RunnableLike<typeof AgentStateAnnotation> | Runnable
	stateGraph?: Runnable
	nextNodes?: TXpertTeamNode[]
	failNode?: TXpertTeamNode
}

export function parseXmlString(content: string) {
	return content?.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
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
