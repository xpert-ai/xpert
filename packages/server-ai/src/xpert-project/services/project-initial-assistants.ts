import type { IXpert } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { normalizeSubAgentConnectionNodeKey } from '../../shared/agent/sub-agent'
import { isSameXpertFamily } from '../../xpert/xpert-family'
import type { XpertProjectXpertScope } from './project-xpert-binding.service'

/** Published External edges seed membership once; required only controls runtime selection. */
export function projectExternalAssistantIds(xpert: IXpert, agentKey?: string): string[] {
    const graph = xpert.graph
    if (!graph) return []
    const nodeIds = new Set(graph.nodes.filter((node) => node.type === 'xpert').map((node) => node.key))
    return [
        ...new Set(
            graph.connections
                .filter(
                    (edge) =>
                        edge.type === 'xpert' &&
                        (!agentKey || normalizeSubAgentConnectionNodeKey(edge.from) === agentKey)
                )
                .map((edge) => normalizeSubAgentConnectionNodeKey(edge.to))
                .filter((id) => nodeIds.has(id))
        )
    ]
}

/** Resolve a creation snapshot. Callers authorize roots; published edges authorize dependencies, not token reuse. */
export async function resolveInitialProjectAssistants(
    roots: IXpert[],
    scope: XpertProjectXpertScope,
    loadCurrent: (id: string) => Promise<IXpert | null>
): Promise<IXpert[]> {
    const members: IXpert[] = []
    const visitedIds = new Set<string>()
    const pending = roots.map((root) => root.id)
    while (pending.length) {
        const id = pending.shift()!
        if (visitedIds.has(id)) continue
        visitedIds.add(id)
        const assistant = await loadCurrent(id)
        if (
            !assistant ||
            assistant.tenantId !== scope.tenantId ||
            (assistant.organizationId ?? null) !== (scope.organizationId ?? null) ||
            !assistant.publishAt ||
            assistant.active === false ||
            !assistant.graph ||
            !assistant.agent?.key
        ) {
            throw new BadRequestException({
                errorCode: 'project_initial_assistant_unavailable',
                message: t('server-ai:Error.ProjectInitialAssistantUnavailable', { assistantId: id })
            })
        }
        if (members.some((member) => isSameXpertFamily(member, assistant))) continue
        if (members.length >= 256) {
            throw new BadRequestException({
                errorCode: 'project_initial_assistants_limit',
                message: t('server-ai:Error.ProjectInitialAssistantsLimit')
            })
        }
        members.push(assistant)
        pending.push(...projectExternalAssistantIds(assistant))
    }
    return members
}
