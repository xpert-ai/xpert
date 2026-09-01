import type { IXpert, TXpertTemplateSource } from '@xpert-ai/contracts'
import { normalizePluginName } from '@xpert-ai/server-core'
import { resolveRuntimeXpert } from '@xpert-ai/contracts'
import { resolveXpertTemplateSource } from './template-source'

/**
 * Invariants:
 * - Only required, direct `xpert` edges from the requester Agent are runtime bindings.
 * - Compatibility requires the expected official template identity and primary Agent key.
 * - Internal Xpert IDs may be used by the runtime but must be removed from View Host projections.
 */
export type ExternalAssistantBindingStatus = 'available' | 'incompatible' | 'unpublished' | 'cross_organization'

/** Safe binding descriptor exposed outside the server-side resolution boundary. */
export type ExternalAssistantBindingDescriptor = {
    title: string
    name: string
    avatar?: IXpert['avatar']
    templateSource: TXpertTemplateSource | null
    primaryAgentKey?: string
    publishedVersion?: string
    status: ExternalAssistantBindingStatus
}

/** Server-only binding descriptor that retains the resolved Assistant instance ID. */
export type ResolvedExternalAssistantBinding = ExternalAssistantBindingDescriptor & {
    xpertId: string
}

/** Official template and primary Agent identity required by a plugin role. */
export type ExternalAssistantBindingExpectation = {
    pluginName: string
    templateKey: string
    agentKey: string
}

/** Returns only external Assistants directly connected to the selected Agent. */
export function directExternalAssistantIds(xpert: IXpert, agentKey: string): string[] {
    const graph = xpert.graph
    if (!graph) return []
    const xpertNodeIds = new Set(graph.nodes.filter((node) => node.type === 'xpert').map((node) => node.key))
    return Array.from(
        new Set(
            graph.connections
                .filter(
                    (connection) =>
                        connection.type === 'xpert' && connection.from === agentKey && connection.required === true
                )
                .map((connection) => connection.to)
                .filter((id) => xpertNodeIds.has(id))
        )
    )
}

/** Describes publication and organization compatibility for one candidate Assistant. */
export function describeExternalAssistantBinding(
    requester: IXpert,
    candidate: IXpert
): ResolvedExternalAssistantBinding {
    const runtime = resolveRuntimeXpert(candidate, false)
    const templateSource = resolveXpertTemplateSource(candidate)
    const sameOrganization = Boolean(
        requester.organizationId && runtime.organizationId && requester.organizationId === runtime.organizationId
    )
    const published = Boolean(runtime.publishAt && runtime.graph && runtime.agent?.key && runtime.active !== false)
    return {
        xpertId: runtime.id,
        title: runtime.title?.trim() || runtime.name,
        name: runtime.name,
        ...(runtime.avatar ? { avatar: runtime.avatar } : {}),
        templateSource,
        ...(runtime.agent?.key ? { primaryAgentKey: runtime.agent.key } : {}),
        ...(runtime.version ? { publishedVersion: runtime.version } : {}),
        status: !sameOrganization ? 'cross_organization' : !published ? 'unpublished' : 'available'
    }
}

/** Tests whether a resolved binding satisfies the plugin's portable role identity. */
export function matchesExternalAssistantExpectation(
    binding: ResolvedExternalAssistantBinding,
    expectation: ExternalAssistantBindingExpectation
) {
    const expectedPluginName = normalizePluginName(expectation.pluginName)
    const actualPluginName = normalizePluginName(binding.templateSource?.pluginName ?? '')
    return (
        actualPluginName === expectedPluginName &&
        binding.templateSource?.templateKey === expectation.templateKey &&
        binding.primaryAgentKey === expectation.agentKey
    )
}

/** Removes the internal instance ID before returning binding metadata to plugins or Views. */
export function safeExternalAssistantBinding(
    binding: ResolvedExternalAssistantBinding
): ExternalAssistantBindingDescriptor {
    const { xpertId: _xpertId, ...safe } = binding
    return safe
}
