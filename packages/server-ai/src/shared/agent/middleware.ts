import {
	getAgentMiddlewareNodes,
	isMiddlewareToolEnabled,
	IWFNMiddleware,
	isRequiredMiddleware,
	IXpertAgent,
	normalizeMiddlewareProvider,
	TXpertGraph,
	WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import {
	AgentMiddleware,
	AgentMiddlewareRegistry,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { TXpertAgentRuntimeOptions } from './state'
import { filterDisabledTools } from './tool-preference'
import { orderNodesByKeyOrder } from './workflow'
import { SKILLS_MIDDLEWARE_NAME } from '../../skill-package/types'

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

export function getRuntimeEnabledMiddlewareNodes(
	graph: TXpertGraph,
	agent: IXpertAgent,
	options?: TXpertAgentRuntimeOptions
) {
	const middlewares = orderNodesByKeyOrder(
		getAgentMiddlewareNodes(graph, agent.key),
		agent.options?.middlewares?.order || []
	)
	const runtimeCapabilities = options?.runtimeCapabilities
	if (runtimeCapabilities?.mode !== 'allowlist') {
		return middlewares
	}

	const selectedMiddlewareNodeKeys = new Set(runtimeCapabilities.plugins?.nodeKeys ?? [])
	const hasSelectedSkills = (runtimeCapabilities.skills?.ids ?? []).length > 0

	return middlewares.filter((middlewareNode) => {
		const entity = middlewareNode?.entity as unknown as IWFNMiddleware
		if (isRequiredMiddleware(entity)) {
			return true
		}

		if (selectedMiddlewareNodeKeys.has(middlewareNode.key)) {
			return true
		}

		const provider = normalizeMiddlewareProvider(entity?.provider)
		return hasSelectedSkills && provider === SKILLS_MIDDLEWARE_NAME
	})
}

export async function getAgentMiddlewares(
	graph: TXpertGraph,
	agent: IXpertAgent,
	agentMiddlewareRegistry: AgentMiddlewareRegistry,
	context: Omit<IAgentMiddlewareContext, 'node'>,
	options?: TXpertAgentRuntimeOptions
): Promise<AgentMiddleware[]> {
	const middlewares = getRuntimeEnabledMiddlewareNodes(graph, agent, options)

	const result: AgentMiddleware[] = []
	for (const middlewareNode of middlewares) {
		const entity = middlewareNode?.entity as unknown as IWFNMiddleware
		const provider = normalizeMiddlewareProvider(entity?.provider)

		let strategy: IAgentMiddlewareStrategy
		try {
			strategy = agentMiddlewareRegistry.get(provider)
		} catch {
			console.warn(`Middleware provider not found: ${provider}`)
			continue
		}

		const middleware = await strategy.createMiddleware(entity.options, {
			...context,
			xpertFeatures: context.xpertFeatures ?? null,
			node: {
				...(middlewareNode.entity as IWFNMiddleware),
				provider
			}
		})
		if (middleware?.tools?.length) {
			const enabledTools = middleware.tools.filter((tool) => isMiddlewareToolEnabled(entity?.tools?.[tool.name]))
			middleware.tools = filterDisabledTools(
				enabledTools,
				'middleware',
				middlewareNode.key,
				options?.toolPreferences
			)
		}
		if (middleware) result.push(middleware)
	}

	return result
}
