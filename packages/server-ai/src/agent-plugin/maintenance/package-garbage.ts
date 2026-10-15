// Commit retired paths with the database change. Files are deleted afterwards and failures remain retryable.
import { TenantSetting } from '@xpert-ai/server-core'
import { v5 as uuid } from 'uuid'
import { z } from 'zod/v3'
import type { EntityManager } from 'typeorm'
import type { AgentPluginScope } from '../agent-plugin-scope'
import { AgentPluginPackage } from '../agent-plugin.entity'
import { removePackageFiles } from './package-storage'

const queueSchema = z.array(z.string().min(1)).max(10000)
function key(scope: AgentPluginScope) {
    return uuid(`agent-plugin-garbage:${scope.tenantId}:${scope.organizationId}`, uuid.URL)
}
async function read(manager: EntityManager, scope: AgentPluginScope) {
    const row = await manager.findOneBy(TenantSetting, { id: key(scope), tenantId: scope.tenantId })
    return row?.value ? queueSchema.parse(JSON.parse(row.value)) : []
}
async function save(manager: EntityManager, scope: AgentPluginScope, paths: string[]) {
    await manager.save(TenantSetting, {
        id: key(scope),
        tenantId: scope.tenantId,
        name: 'agentPluginGarbage',
        value: JSON.stringify(paths)
    })
}
export async function retirePackageFiles(manager: EntityManager, scope: AgentPluginScope, paths: string[]) {
    if (paths.length) await save(manager, scope, [...new Set([...(await read(manager, scope)), ...paths])])
}
/** Caller holds the package scope lock. A crash can leave queued paths, never a missing live package. */
export async function collectPackageGarbage(manager: EntityManager, scope: AgentPluginScope) {
    const remaining: string[] = []
    for (const path of await read(manager, scope)) {
        try {
            if (await manager.findOneBy(AgentPluginPackage, { rootPath: path })) {
                remaining.push(path)
                continue
            }
            await removePackageFiles(path, scope)
        } catch {
            remaining.push(path)
        }
    }
    await save(manager, scope, remaining)
    return remaining.length
}

export async function pendingPackageFiles(manager: EntityManager, scope: AgentPluginScope) {
    return (await read(manager, scope)).length
}
