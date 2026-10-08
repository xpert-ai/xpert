import {
    getAgentMiddlewareNodes,
    IWFNMiddleware,
    IXpertAgent,
    TAgentMiddlewareMeta,
    TXpertGraph,
    WorkflowNodeTypeEnum,
    normalizeMiddlewareProvider
} from '@xpert-ai/contracts'
import { SKILLS_MIDDLEWARE_NAME } from '../skill-package/types'
import type { ResolvedRuntimeResources } from './runtime-resource.service'
import { mergeRuntimeMiddlewareOptions } from './runtime-middleware-config'

/** Produces an execution-only overlay. Never mutates a published or draft graph. */
export function applyRuntimeResourceGraph(
    graph: TXpertGraph,
    agent: Pick<IXpertAgent, 'key'>,
    resources: ResolvedRuntimeResources,
    middlewareMeta: (provider: string) => TAgentMiddlewareMeta | undefined = () => undefined
): TXpertGraph {
    const overlay: TXpertGraph = {
        ...graph,
        nodes: [...(graph.nodes ?? [])],
        connections: [...(graph.connections ?? [])]
    }
    const existing = getAgentMiddlewareNodes(graph, agent.key)
    const additions = [...resources.middlewares]
    if (resources.skillIds.length) {
        const skillNode = existing.find(
            (node) =>
                node.type === 'workflow' &&
                node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE &&
                normalizeMiddlewareProvider((node.entity as IWFNMiddleware).provider) === SKILLS_MIDDLEWARE_NAME
        )
        if (skillNode && skillNode.type === 'workflow' && skillNode.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE) {
            const entity = skillNode.entity as IWFNMiddleware
            overlay.nodes = overlay.nodes.map((node) =>
                node.type === 'workflow' && node.key === skillNode.key
                    ? {
                          ...node,
                          entity: { ...entity, required: true, options: { ...entity.options } } as IWFNMiddleware
                      }
                    : node
            )
        } else
            additions.push({
                key: 'runtime_resource_skills',
                entity: {
                    id: 'runtime_resource_skills',
                    key: 'runtime_resource_skills',
                    type: WorkflowNodeTypeEnum.MIDDLEWARE,
                    provider: SKILLS_MIDDLEWARE_NAME,
                    options: { resourceOnly: true }
                }
            })
    }
    const groups = new Map<string, typeof additions>()
    for (const item of additions) {
        const provider = normalizeMiddlewareProvider(item.entity.provider)
        const group = groups.get(provider) ?? []
        group.push(item)
        groups.set(provider, group)
    }
    for (const [provider, items] of groups) {
        const item = items[0]
        const match = existing.find(
            (node) =>
                node.type === 'workflow' &&
                node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE &&
                normalizeMiddlewareProvider((node.entity as IWFNMiddleware).provider) === provider
        )
        const options = mergeRuntimeMiddlewareOptions(
            provider,
            match ? ((match.entity as IWFNMiddleware).options ?? {}) : undefined,
            items.map((item) => item.entity.options ?? {}),
            middlewareMeta(provider)
        )
        if (match) {
            overlay.nodes = overlay.nodes.map((node) =>
                node.type === 'workflow' && node.key === match.key
                    ? { ...node, entity: { ...match.entity, required: true, options } as IWFNMiddleware }
                    : node
            )
            continue
        }
        overlay.nodes.push({
            key: item.key,
            type: 'workflow',
            position: { x: 0, y: 0 },
            entity: { ...item.entity, provider, required: true, options } as IWFNMiddleware
        })
        overlay.connections.push({ key: `resource_edge_${item.key}`, type: 'workflow', from: agent.key, to: item.key })
    }
    return overlay
}
