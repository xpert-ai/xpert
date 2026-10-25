// One graph interpretation for View discovery, View runtime and explicit-actor access.
// Discovery alone never grants access; execution callers must also authorize the Assistant.
import { ForbiddenException } from '@nestjs/common'
import {
    normalizeMiddlewareProvider,
    WorkflowNodeTypeEnum,
    XpertTypeEnum,
    type IWFNMiddleware,
    type IXpert,
    type TXpertTeamNode
} from '@xpert-ai/contracts'
import type { AgentMiddlewareRegistry, AssistantMiddlewareRequirement } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { getRuntimeEnabledMiddlewareNodes } from '../../shared/agent/middleware'

type MiddlewareRegistry = Pick<AgentMiddlewareRegistry, 'get'>

export function inspectAssistantMiddlewares(xpert: IXpert, registry: MiddlewareRegistry) {
    const agent = xpert.agent?.key
        ? xpert.agent
        : xpert.graph?.nodes?.find((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')?.entity
    const nodes = xpert.graph && agent?.key ? getRuntimeEnabledMiddlewareNodes(xpert.graph, agent) : []
    const middlewares = nodes.flatMap((entry) => {
        if (entry.type !== 'workflow' || entry.entity.type !== WorkflowNodeTypeEnum.MIDDLEWARE ||
            !('provider' in entry.entity) || typeof entry.entity.provider !== 'string') return []
        const provider = normalizeMiddlewareProvider(entry.entity.provider)
        if (!provider) return []
        const node = entry.entity as IWFNMiddleware
        let features: string[] = []
        try {
            features = (registry.get(provider, xpert.organizationId ?? undefined).meta.features ?? [])
                .map((feature) => feature.trim()).filter(Boolean)
        } catch {
            // Keep missing installations visible for configuration, but grant no feature.
        }
        return [{ key: entry.key, provider, node, features }]
    })
    return { agent, nodes, middlewares }
}

export function requireAssistantMiddleware(
    xpert: IXpert,
    registry: MiddlewareRegistry,
    requirement: AssistantMiddlewareRequirement
) {
    const provider = normalizeMiddlewareProvider(requirement.provider)
    const feature = requirement.requiredFeature.trim()
    const { agent, nodes, middlewares } = inspectAssistantMiddlewares(xpert, registry)
    const matching = middlewares.filter((entry) => entry.provider === provider)
    // Never choose silently between differently configured instances of the same provider.
    if (xpert.type !== XpertTypeEnum.Agent || !agent?.key || !provider || !feature ||
        matching.length !== 1 || !matching[0].features.includes(feature)) {
        throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
    }
    return { agent, nodes, node: matching[0].node, provider }
}
