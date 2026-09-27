import type { WorkspaceAgentPlugin } from '@xpert-ai/contracts'
import type { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'

export function workspacePluginCatalog(
    packages: AgentPluginPackage[],
    bindings: AgentResourceBinding[],
    workspaceId: string
): WorkspaceAgentPlugin[] {
    const groups = new Map<string, AgentPluginPackage[]>()
    for (const pkg of packages) {
        const versions = groups.get(pkg.descriptor.name) ?? []
        versions.push(pkg)
        groups.set(pkg.descriptor.name, versions)
    }
    return [...groups.values()].map((versions) => {
        const ids = new Set(versions.map((pkg) => pkg.id))
        const current = bindings.filter(
            (binding) =>
                binding.definition.kind === 'agent_plugin' &&
                ids.has(binding.definition.packageId) &&
                !binding.supersededById &&
                binding.workspaceIds.includes(workspaceId)
        )
        const binding = current.find((item) => item.enabled) ?? current[0]
        const definition = binding?.definition
        const pkg =
            versions.find((item) => definition?.kind === 'agent_plugin' && item.id === definition.packageId) ??
            versions[0]
        const descriptor = pkg.descriptor
        return {
            id: pkg.id,
            name: descriptor.extension?.interface?.displayName || descriptor.name,
            description: descriptor.extension?.interface?.description || descriptor.description,
            icon: descriptor.extension?.interface?.icon,
            version: descriptor.version || pkg.digest.slice(0, 8),
            status: binding?.enabled ? 'available' : binding ? 'disabled' : 'not_published',
            components: [
                ...descriptor.skills.map((item) => ({ kind: 'skill' as const, name: item.key })),
                ...descriptor.servers.map((item) => ({ kind: 'mcp' as const, name: item.key })),
                ...(descriptor.extension?.middlewares ?? []).map((item) => ({
                    kind: 'middleware' as const,
                    name: item.provider
                })),
                ...(descriptor.extension?.experts ?? []).map((item) => ({
                    kind: 'external_xpert' as const,
                    name: item.reference
                }))
            ],
            expertReferences: [...new Set((descriptor.extension?.experts ?? []).map((item) => item.reference))]
        }
    })
}
