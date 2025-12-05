import {
	getAgentMiddlewareNodes,
	IWFNMiddleware,
	IXpertAgent,
	TXpertGraph,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import {
	AgentMiddleware,
	AgentMiddlewareRegistry,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { orderNodesByKeyOrder } from './workflow'

const normalizeNodeKey = (key: string) => key?.split('/')?.[0]

export const isSkillsConnectedToAgent = (graph: TXpertGraph, agent: IXpertAgent) => {
	const currentGraph = graph // getCurrentGraph(graph, agent.key)
	const skillsNodes = currentGraph.nodes?.filter(
		(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.SKILL
	)
	if (!skillsNodes?.length) {
		return false
	}
	const connections = currentGraph.connections?.filter((conn) => conn.type === 'workflow') ?? []
	return skillsNodes.some((node) =>
		connections.some((conn) => {
			const from = normalizeNodeKey(conn.from)
			const to = normalizeNodeKey(conn.to)
			return (from === agent.key && to === node.key) || (to === agent.key && from === node.key)
		})
	)
}

export async function getAgentMiddlewares(
	graph: TXpertGraph,
	agent: IXpertAgent,
	agentMiddlewareRegistry: AgentMiddlewareRegistry,
	context: IAgentMiddlewareContext
): Promise<AgentMiddleware[]> {
	const middlewares = orderNodesByKeyOrder(
		getAgentMiddlewareNodes(graph, agent.key),
		agent.options?.middlewares?.order || []
	)

	const result: AgentMiddleware[] = []
	for (const middlewareNode of middlewares) {
		const entity = middlewareNode?.entity as unknown as IWFNMiddleware
		const provider = entity?.provider

		let strategy: IAgentMiddlewareStrategy
		try {
			strategy = agentMiddlewareRegistry.get(provider)
		} catch {
			console.warn(`Middleware provider not found: ${provider}`)
			continue
		}

		const middleware = await strategy.createMiddleware(entity.options, context)
		if (middleware) result.push(middleware)
	}

	return result
}
