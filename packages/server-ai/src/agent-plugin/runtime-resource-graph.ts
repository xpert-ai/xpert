import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { isEqual } from 'lodash'
import {
    getAgentMiddlewareNodes,
    IWFNMiddleware,
    IXpertAgent,
    TXpertGraph,
    WorkflowNodeTypeEnum,
    normalizeMiddlewareProvider
} from '@xpert-ai/contracts'
import { SKILLS_MIDDLEWARE_NAME } from '../skill-package/types'
import type { ResolvedRuntimeResources } from './runtime-resource.service'

/** Produces an execution-only overlay. Never mutates a published or draft graph. */
export function applyRuntimeResourceGraph(
    graph: TXpertGraph,
    agent: IXpertAgent,
    resources: ResolvedRuntimeResources
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
    for (const item of additions) {
        const match = existing.find(
            (node) =>
                node.type === 'workflow' &&
                node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE &&
                normalizeMiddlewareProvider((node.entity as IWFNMiddleware).provider) ===
                    normalizeMiddlewareProvider(item.entity.provider)
        )
        if (match) {
            if (!isEqual((match.entity as IWFNMiddleware).options ?? {}, item.entity.options ?? {}))
                throw new BadRequestException(
                    t('server-ai:Error.AgentResourceConflict', {
                        defaultValue: 'Selected middleware configurations conflict.'
                    })
                )
            overlay.nodes = overlay.nodes.map((node) =>
                node.type === 'workflow' && node === match
                    ? { ...node, entity: { ...match.entity, required: true } as IWFNMiddleware }
                    : node
            )
            continue
        }
        overlay.nodes.push({
            key: item.key,
            type: 'workflow',
            position: { x: 0, y: 0 },
            entity: { ...item.entity, required: true } as IWFNMiddleware
        })
        overlay.connections.push({ key: `resource_edge_${item.key}`, type: 'workflow', from: agent.key, to: item.key })
    }
    return overlay
}
