import {
    CONVERSATION_MAP_FEATURE,
    getAgentMiddlewareNodes,
    normalizeMiddlewareProvider,
    WorkflowNodeTypeEnum,
    type IWFNMiddleware,
    type IXpert,
    type TXpertTeamNode
} from '@xpert-ai/contracts'
import type { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'

/** Shared by published runtime consumers and the Agent View host; connected middleware owns its features. */
export function agentCapabilities(xpert: IXpert, registry: Pick<AgentMiddlewareRegistry, 'get'>) {
    const graph = xpert.graph
    const primary = graph?.nodes?.find((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')
    const agentKey = xpert.agent?.key ?? primary?.key ?? primary?.entity.key ?? null
    const features = new Set<string>([
        CONVERSATION_MAP_FEATURE,
        ...Object.entries(xpert.features ?? {})
            .filter(([, value]) => Boolean(value && typeof value === 'object' && 'enabled' in value && value.enabled))
            .map(([key]) => key)
    ])
    const middlewareProviders = new Set<string>(),
        middlewareNodeKeys = new Set<string>()
    if (graph && agentKey)
        for (const node of getAgentMiddlewareNodes(graph, agentKey)) {
            if (node.type !== 'workflow' || node.entity.type !== WorkflowNodeTypeEnum.MIDDLEWARE) continue
            const provider = normalizeMiddlewareProvider((node.entity as IWFNMiddleware).provider)
            if (!provider) continue
            middlewareProviders.add(provider)
            middlewareNodeKeys.add(node.key)
            try {
                const strategy = registry.get(provider, xpert.organizationId ?? undefined)
                for (const feature of strategy.meta.features ?? [])
                    if (typeof feature === 'string' && feature.trim()) features.add(feature.trim())
            } catch {
                /* Missing middleware cannot grant capabilities. */
            }
        }
    const availableAgents = (graph?.nodes ?? [])
        .filter((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')
        .map((node) => ({
            key: node.entity?.key ?? node.key,
            title: node.entity?.title ?? node.entity?.name ?? node.entity?.key ?? node.key,
            role: node.entity?.description ?? node.entity?.title ?? node.entity?.name ?? node.entity?.key ?? node.key
        }))
        .filter((agent) => Boolean(agent.key))
        .sort((a, b) => a.key.localeCompare(b.key))
    return {
        agentKey,
        features: [...features].sort(),
        availableAgents,
        middlewareProviders: [...middlewareProviders].sort(),
        middlewareNodeKeys: [...middlewareNodeKeys].sort()
    }
}
