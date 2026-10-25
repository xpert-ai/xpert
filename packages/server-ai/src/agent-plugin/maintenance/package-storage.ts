// Imports and cleanup share a scope lock; repair switches paths only after verifying a fresh copy.
// Never remove a persisted path until its real parent and UUID directory pass containment checks.
import { mkdir, lstat, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getConfig } from '@xpert-ai/server-config'
import type { EntityManager } from 'typeorm'
import type { AgentPluginScope } from '../agent-plugin-scope'
import { fileErrorCode } from '../portable-package-files'
import { copyPortablePackage, portablePackageDigest } from '../agent-plugin-source'

export async function lockPackageScope(manager: EntityManager, scope: AgentPluginScope) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `agent-plugin-packages:${scope.tenantId}:${scope.organizationId ?? '_tenant'}`
    ])
}

export function packageScopeDirectory(scope: AgentPluginScope) {
    const { dataPath, agentPluginPath } = getConfig().assetOptions
    return resolve(
        agentPluginPath || join(dataPath, 'agent-plugins'),
        scope.tenantId,
        scope.organizationId ?? '_tenant'
    )
}

export async function assertPackagePath(path: string, scope: AgentPluginScope) {
    const parent = packageScopeDirectory(scope)
    if (dirname(resolve(path)) !== parent || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(basename(path)))
        throw new Error('Invalid Agent plugin storage path')
    await mkdir(parent, { recursive: true })
    if ((await realpath(parent)) !== parent) throw new Error('Agent plugin storage must not traverse symbolic links')
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
    })
    if (info?.isSymbolicLink()) throw new Error('Agent plugin storage must not be a symbolic link')
}

export async function packageIntact(path: string, digest: string, scope: AgentPluginScope) {
    await assertPackagePath(path, scope)
    try {
        return (await portablePackageDigest(path)) === digest
    } catch (error) {
        if (fileErrorCode(error) === 'ENOENT') return false
        throw error
    }
}

export async function removePackageFiles(path: string, scope: AgentPluginScope) {
    await assertPackagePath(path, scope)
    await rm(path, { recursive: true, force: true })
}

export async function stagePackageFiles(root: string, digest: string, scope: AgentPluginScope) {
    const rootPath = resolve(packageScopeDirectory(scope), randomUUID())
    await assertPackagePath(rootPath, scope)
    await mkdir(rootPath)
    try {
        const skipped = await copyPortablePackage(root, rootPath)
        if ((await portablePackageDigest(rootPath)) !== digest) throw new Error('Plugin changed during import')
        return { rootPath, skipped }
    } catch (error) {
        await removePackageFiles(rootPath, scope)
        throw error
    }
}
