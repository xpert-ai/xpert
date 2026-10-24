import { resolveI18nText } from '@xpert-ai/contracts'
// Package imports are scope installations. Legacy bindings retain their exact references
// and per-workspace configuration; workspace membership no longer controls plugin visibility.
import { createHash } from 'node:crypto'
import type { AgentResourceBinding } from './agent-plugin.entity'
import type { AgentPluginScope } from './agent-plugin-scope'
import type { InstalledPluginInventoryPackage } from './installed-plugin-inventory'

export function importedPluginBinding(pkg: InstalledPluginInventoryPackage, language?: string): AgentResourceBinding {
    const key = createHash('sha256').update(`installed-agent-plugin:${pkg.tenantId}:${pkg.id}`).digest('hex')
    const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`
    const definition: AgentResourceBinding['definition'] = {
        kind: 'agent_plugin',
        packageId: pkg.id,
        experts: {},
        availability: 'scope',
        connectorServers: pkg.descriptor.extension?.connectors
    }
    return {
        id,
        tenantId: pkg.tenantId,
        organizationId: pkg.organizationId ?? null,
        title: resolveI18nText(pkg.descriptor.extension?.interface?.displayName, language) || pkg.descriptor.name,
        description:
            resolveI18nText(pkg.descriptor.extension?.interface?.description, language) || pkg.descriptor.description,
        version: createHash('sha256')
            .update(JSON.stringify([id, pkg.digest, definition]))
            .digest('hex'),
        definition,
        workspaceIds: [],
        installations: {},
        expertVersions: {},
        enabled: true,
        createdAt: pkg.createdAt
    }
}

function newest(a: { createdAt?: Date; id?: string }, b: { createdAt?: Date; id?: string }) {
    return (
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime() ||
        (a.id ?? '').localeCompare(b.id ?? '')
    )
}

export function installedPluginBindings(
    packages: InstalledPluginInventoryPackage[],
    bindings: AgentResourceBinding[],
    scope: AgentPluginScope,
    workspaceId?: string,
    language?: string
): AgentResourceBinding[] {
    const groups = new Map<string, InstalledPluginInventoryPackage[]>()
    for (const pkg of [...packages].sort(newest)) {
        if (pkg.tenantId !== scope.tenantId || (pkg.organizationId && pkg.organizationId !== scope.organizationId))
            continue
        const group = groups.get(pkg.descriptor.name) ?? []
        group.push(pkg)
        groups.set(pkg.descriptor.name, group)
    }
    return [...groups.values()].map((group) => {
        // An organization installation, including a disabled one, shadows the tenant installation.
        const local = group.filter((pkg) => !!scope.organizationId && pkg.organizationId === scope.organizationId)
        const versions = local.length ? local : group
        const ids = new Set(versions.map((pkg) => pkg.id))
        const current = bindings
            .filter(
                (binding) =>
                    binding.tenantId === scope.tenantId &&
                    (binding.organizationId ?? null) === (versions[0].organizationId ?? null) &&
                    binding.definition.kind === 'agent_plugin' &&
                    ids.has(binding.definition.packageId) &&
                    !binding.supersededById
            )
            .sort(newest)
        const configured = current.find(
            (binding) => binding.definition.kind === 'agent_plugin' && binding.definition.availability === 'scope'
        )
        const active = current.filter((binding) => binding.enabled)
        const legacy =
            active.find((binding) => workspaceId && binding.workspaceIds.includes(workspaceId)) ??
            active[0] ??
            current[0]
        const selected = configured ?? legacy
        const unconfigured = versions.find(
            (pkg) =>
                !bindings.some(
                    (binding) => binding.definition.kind === 'agent_plugin' && binding.definition.packageId === pkg.id
                )
        )
        if (unconfigured && (!selected || newest(unconfigured, selected) < 0))
            return importedPluginBinding(unconfigured, language)
        return selected ?? importedPluginBinding(versions[0], language)
    })
}
