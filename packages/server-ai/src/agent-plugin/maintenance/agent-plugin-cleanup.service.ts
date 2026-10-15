import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, type EntityManager } from 'typeorm'
import { t } from 'i18next'
import type { AgentPluginCleanupItem, AgentPluginCleanupResult } from '@xpert-ai/contracts'
import { AgentPluginPackage, AgentResourceBinding } from '../agent-plugin.entity'
import { requireResourceAdmin } from '../agent-plugin.service'
import { agentPluginScopeWhere, type AgentPluginScope } from '../agent-plugin-scope'
import { importedPluginBinding, installedPluginBindings } from '../installed-plugin-catalog'
import { lockPackageScope, assertPackagePath } from './package-storage'
import { retirePackageFiles, collectPackageGarbage, pendingPackageFiles } from './package-garbage'
import { AgentPluginUpdateStore } from './agent-plugin-update.store'
import { referencedPackages } from './package-references'

@Injectable()
export class AgentPluginCleanupService {
    constructor(
        private readonly database: DataSource,
        private readonly updates: AgentPluginUpdateStore
    ) {}

    private async inspect(manager: EntityManager, scope: AgentPluginScope, packageId: string) {
        const packages = await manager.find(AgentPluginPackage, {
            where: agentPluginScopeWhere(scope),
            order: { createdAt: 'DESC', id: 'ASC' }
        })
        const target = packages.find((pkg) => pkg.id === packageId)
        if (!target) throw new NotFoundException(t('server-ai:Error.AgentPluginNotFound'))
        const family = packages.filter((pkg) => pkg.descriptor.name === target.descriptor.name)
        let bindings = await manager.find(AgentResourceBinding, { where: agentPluginScopeWhere(scope) })
        // Lock both synthetic imports and persisted automatic defaults before rechecking their use.
        const familyIds = new Set(family.map((pkg) => pkg.id))
        const referenceIds = new Set([
            ...family.map((pkg) => importedPluginBinding(pkg).id),
            ...bindings
                .filter(
                    (binding) =>
                        binding.definition.kind === 'agent_plugin' && familyIds.has(binding.definition.packageId)
                )
                .map((binding) => binding.id)
        ])
        for (const id of [...referenceIds].sort()) {
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agent-plugin:${id}`])
        }
        bindings = await manager.find(AgentResourceBinding, { where: agentPluginScopeWhere(scope) })
        const current = installedPluginBindings(family, bindings, scope)[0]
        const activePackageId = current?.definition.kind === 'agent_plugin' ? current.definition.packageId : undefined
        const configured = new Set(
            bindings.flatMap((binding) =>
                binding.definition.kind === 'agent_plugin' &&
                (!binding.cleanupEligible || Object.keys(binding.installations).length)
                    ? [binding.definition.packageId]
                    : []
            )
        )
        const update = await this.updates.read(scope, manager)
        const referenced = await referencedPackages(
            manager,
            family.filter((pkg, i) => i > 0 && pkg.id !== activePackageId && !configured.has(pkg.id)),
            bindings
        )
        const items: AgentPluginCleanupItem[] = family.map((pkg, i) => ({
            packageId: pkg.id,
            version: pkg.descriptor.version || pkg.digest.slice(0, 8),
            reason:
                i === 0 || pkg.id === activePackageId
                    ? 'current'
                    : update.phase === 'updating' && update.packageId === pkg.id
                      ? 'updating'
                      : configured.has(pkg.id)
                        ? 'configured'
                        : referenced.has(pkg.id)
                          ? 'referenced'
                          : 'unreferenced'
        }))
        return { family, items, bindings }
    }

    async preview(packageId: string): Promise<AgentPluginCleanupResult> {
        const scope = requireResourceAdmin()
        return this.database.transaction(async (manager) => {
            await lockPackageScope(manager, scope)
            const { items, family } = await this.inspect(manager, scope, packageId)
            return {
                targetPackageId: family[0].id,
                items,
                deleted: [],
                pendingFileCleanup: await pendingPackageFiles(manager, scope)
            }
        })
    }

    async cleanup(packageId: string, packageIds: string[]): Promise<AgentPluginCleanupResult> {
        const scope = requireResourceAdmin()
        const result = await this.database.transaction(async (manager) => {
            await lockPackageScope(manager, scope)
            // Recheck every identity inside the locks: a preview is never authority to delete.
            const { family, items, bindings } = await this.inspect(manager, scope, packageId)
            const ids = new Set(
                items
                    .filter((item) => item.reason === 'unreferenced' && packageIds.includes(item.packageId))
                    .map((item) => item.packageId)
            )
            const obsolete = family.filter((pkg) => ids.has(pkg.id))
            for (const pkg of obsolete) await assertPackagePath(pkg.rootPath, scope)
            await retirePackageFiles(
                manager,
                scope,
                obsolete.map((pkg) => pkg.rootPath)
            )
            for (const binding of bindings) {
                if (binding.definition.kind === 'agent_plugin' && ids.has(binding.definition.packageId))
                    await manager.delete(AgentResourceBinding, { ...agentPluginScopeWhere(scope), id: binding.id })
            }
            for (const pkg of obsolete)
                await manager.delete(AgentPluginPackage, { ...agentPluginScopeWhere(scope), id: pkg.id })
            return { targetPackageId: family[0].id, items, deleted: [...ids], pendingFileCleanup: 0 }
        })
        result.pendingFileCleanup = await this.database.transaction(async (manager) => {
            await lockPackageScope(manager, scope)
            return collectPackageGarbage(manager, scope)
        })
        return result
    }
}
