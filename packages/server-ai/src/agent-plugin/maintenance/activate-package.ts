// Explicit updates choose a new catalog default without rewriting or superseding pinned references.
import { createHash, randomUUID } from 'node:crypto'
import type { EntityManager } from 'typeorm'
import { AgentPluginPackage, AgentResourceBinding } from '../agent-plugin.entity'
import { agentPluginScopeWhere, type AgentPluginScope } from '../agent-plugin-scope'
import { importedPluginBinding, installedPluginBindings } from '../installed-plugin-catalog'

export async function activatePackage(
    manager: EntityManager,
    pkg: AgentPluginPackage,
    previous: AgentResourceBinding | undefined
) {
    const fallback = importedPluginBinding(pkg)
    const experts = Object.fromEntries(
        (pkg.descriptor.extension?.experts ?? []).flatMap(({ reference }) => {
            const id = previous?.definition.kind === 'agent_plugin' && previous.definition.experts[reference]
            return id ? [[reference, id]] : []
        })
    )
    const id = randomUUID()
    const definition: AgentResourceBinding['definition'] = {
        ...fallback.definition,
        kind: 'agent_plugin',
        packageId: pkg.id,
        experts
    }
    await manager.save(AgentResourceBinding, {
        ...fallback,
        cleanupEligible: true,
        id,
        createdAt: new Date(Math.max(Date.now(), new Date(previous?.createdAt ?? 0).getTime() + 1)),
        title: previous?.title ?? fallback.title,
        description: previous?.description ?? fallback.description,
        enabled: previous?.enabled ?? true,
        definition,
        expertVersions: Object.fromEntries(
            Object.values(experts).flatMap((expert) =>
                previous?.expertVersions[expert] ? [[expert, previous.expertVersions[expert]]] : []
            )
        ),
        version: createHash('sha256')
            .update(JSON.stringify([id, pkg.digest, definition]))
            .digest('hex')
    })
}
export async function currentPackageBinding(manager: EntityManager, scope: AgentPluginScope, name: string) {
    const where = agentPluginScopeWhere(scope)
    const packages = (await manager.find(AgentPluginPackage, { where })).filter((pkg) => pkg.descriptor.name === name)
    const bindings = await manager.find(AgentResourceBinding, { where })
    return installedPluginBindings(packages, bindings, scope)[0]
}
