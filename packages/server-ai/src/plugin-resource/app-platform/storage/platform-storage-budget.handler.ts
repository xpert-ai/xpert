// Account locks span the actual write, including sandbox publication. Object reservations
// survive uncertain provider outcomes; reads and deletion remain available at the limit.
import { createHash } from 'node:crypto'
import path from 'node:path'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { WithStorageBudgetCommand } from '@xpert-ai/server-core'
import { DataSource, EntityManager } from 'typeorm'
import { z } from 'zod/v3'
import { createRuntimeVolumeClient, VolumeScope } from '../../../shared/volume/volume'
import { usesFlattenedSandboxVolumeLayout } from '../../../shared/volume/volume-layout'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { platformFailure } from '../platform-error'
import { AppPlatformStorageObject, AppPlatformStorageRoot } from './platform-storage-object.entity'
import { canonicalStoragePath, measureStorageTrees, storageContains, storedFileBytes } from './storage-tree'

const identities = z.array(z.object({ id: z.string().uuid() }))
const organizations = z.array(z.object({ organizationId: z.string().uuid().nullable() }))
const storedObjects = z.array(
    z.object({ key: z.string(), provider: z.string(), bytes: z.coerce.number().nonnegative().safe() })
)
const resourceTables = {
    project: 'xpert_project',
    assistant: 'xpert',
    knowledge: 'knowledgebase',
    workspace: 'xpert_workspace'
} as const

@CommandHandler(WithStorageBudgetCommand)
export class WithStorageBudgetHandler implements ICommandHandler<WithStorageBudgetCommand<unknown>> {
    constructor(private readonly database: DataSource) {}

    async execute(command: WithStorageBudgetCommand<unknown>) {
        const write = command.write
        const owner = 'resource' in write ? write.resource : write.owner
        let organizationId = owner.organizationId
        if ('resource' in write && write.resource.kind !== 'user') {
            const resource = write.resource
            const rows = organizations.parse(
                await this.database.query(
                    `SELECT "organizationId" FROM ${resourceTables[resource.kind]} WHERE id=$1 AND "tenantId"=$2`,
                    [resource.id, resource.tenantId]
                )
            )
            if (!rows.length) throw platformFailure('application_storage_scope_invalid', 403)
            organizationId = rows[0].organizationId
        }
        const repository = this.database.getRepository(AppPlatformDelivery)
        const delivery = organizationId
            ? await repository.findOneBy({ tenantId: owner.tenantId, organizationId })
            : owner.userId
              ? await repository.findOneBy({ tenantId: owner.tenantId, userId: owner.userId })
              : null
        if (!delivery) {
            const userId = RequestContext.currentUserId(),
                tenantId = RequestContext.currentTenantId()
            if (userId && tenantId && (await repository.existsBy({ userId, tenantId })))
                throw platformFailure('application_storage_scope_invalid', 403)
            return command.commit(null)
        }
        if (write.kind === 'temporary') {
            const policy =
                delivery.configuration.environment.plans[delivery.configuration.definition.entitlements.defaultPlanRef]
            if (!Number.isSafeInteger(write.bytes) || write.bytes < 0 || write.bytes > policy.maxTemporaryBytes)
                throw platformFailure('application_temporary_storage_limit', 413)
            return command.commit(null)
        }
        if (usesFlattenedSandboxVolumeLayout()) throw platformFailure('application_storage_scope_invalid', 503)
        const runner = this.database.createQueryRunner()
        const key = `app-platform-storage:${delivery.tenantId}:${delivery.userId}`
        let locked = false
        let refresh: (() => Promise<unknown>) | undefined
        try {
            await runner.connect()
            await runner.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key])
            locked = true
            const current = await runner.manager.getRepository(AppPlatformDelivery).findOneByOrFail({ id: delivery.id })
            const policy =
                current.configuration.environment.plans[current.configuration.definition.entitlements.defaultPlanRef]
            const roots = await this.roots(runner.manager, current)
            const objects = await this.objects(runner.manager, current)
            const external =
                (await measureStorageTrees(roots)) + [...objects.values()].reduce((sum, bytes) => sum + bytes, 0)
            const databaseBytes = await this.externalUsage(runner.manager, current, external)
            const used = external + databaseBytes
            if (!Number.isSafeInteger(used)) throw platformFailure('application_storage_limit', 413)
            if (write.kind === 'refresh') return await command.commit(null)
            refresh = async () =>
                this.externalUsage(
                    runner.manager,
                    current,
                    (await measureStorageTrees(roots)) +
                        [...(await this.objects(runner.manager, current)).values()].reduce(
                            (sum, bytes) => sum + bytes,
                            0
                        )
                )

            if (write.kind === 'file' || write.kind === 'sandbox' || write.kind === 'remove') {
                const root = path.resolve(write.root)
                const allowedRoot = roots.find((candidate) => storageContains(candidate, root))
                if (
                    !allowedRoot ||
                    (await canonicalStoragePath(root)) !==
                        path.join(await canonicalStoragePath(allowedRoot), path.relative(allowedRoot, root))
                )
                    throw platformFailure('application_storage_scope_invalid', 403)
                if (write.kind === 'remove') return await command.commit(null)
                if (write.kind === 'sandbox') {
                    const workspaceBytes = await measureStorageTrees([root])
                    const remaining = Math.max(0, policy.maxStorageBytes - used)
                    await this.externalUsage(runner.manager, current, external + remaining)
                    return await command.commit({
                        maxWorkspaceBytes: workspaceBytes + remaining,
                        maxTemporaryBytes: policy.maxTemporaryBytes
                    })
                }
                const target = path.resolve(root, write.path)
                if (target === root || !storageContains(root, target))
                    throw platformFailure('application_storage_scope_invalid', 403)
                if (!Number.isSafeInteger(write.bytes) || write.bytes < 0)
                    throw platformFailure('application_storage_limit', 413)
                const previous = await storedFileBytes(target)
                this.assertGrowth(used, write.bytes - previous, policy.maxStorageBytes)
                await this.externalUsage(runner.manager, current, external + Math.max(0, write.bytes - previous))
                return await command.commit(null)
            }

            const provider = write.provider.toUpperCase()
            const digest = this.objectDigest(provider, write.key)
            const objectRepository = runner.manager.getRepository(AppPlatformStorageObject)
            const existing = await objectRepository.findOneBy({ tenantId: current.tenantId, keyDigest: digest })
            if (existing && existing.userId !== current.userId)
                throw platformFailure('application_storage_scope_invalid', 403)
            if (write.kind === 'delete-object') {
                const result = await command.commit(null)
                if (existing) await objectRepository.delete(existing.id)
                return result
            }
            const previous = objects.get(digest) ?? 0
            if (!Number.isSafeInteger(write.bytes) || write.bytes < 0)
                throw platformFailure('application_storage_limit', 413)
            this.assertGrowth(used, write.bytes - previous, policy.maxStorageBytes)
            await this.externalUsage(runner.manager, current, external + Math.max(0, write.bytes - previous))
            const record = await objectRepository.save(
                objectRepository.create({
                    ...existing,
                    tenantId: current.tenantId,
                    organizationId: current.organizationId,
                    userId: current.userId,
                    provider,
                    key: write.key,
                    keyDigest: digest,
                    bytes: Math.max(previous, write.bytes),
                    confirmed: false
                })
            )
            const result = await command.commit(null)
            await objectRepository.update(record.id, { bytes: write.bytes, confirmed: true })
            return result
        } finally {
            try {
                await refresh?.()
            } finally {
                try {
                    if (locked) await runner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key])
                } finally {
                    await runner.release()
                }
            }
        }
    }

    private async externalUsage(manager: EntityManager, delivery: AppPlatformDelivery, bytes: number) {
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw platformFailure('application_storage_limit', 413)
        const rows = z.array(z.object({ databaseBytes: z.coerce.number().nonnegative().safe() })).parse(
            await manager.query(
                `INSERT INTO app_platform_storage_usage ("tenantId","userId","externalBytes") VALUES ($1,$2,$3)
             ON CONFLICT ("tenantId","userId") DO UPDATE SET "externalBytes"=excluded."externalBytes" RETURNING "databaseBytes"`,
                [delivery.tenantId, delivery.userId, bytes]
            )
        )
        return rows[0].databaseBytes
    }

    private assertGrowth(used: number, growth: number, limit: number) {
        if (!Number.isSafeInteger(growth) || (growth > 0 && used + growth > limit))
            throw platformFailure('application_storage_limit', 413)
    }

    private async roots(manager: EntityManager, delivery: AppPlatformDelivery) {
        const volumes = createRuntimeVolumeClient()
        const scopes: VolumeScope[] = [{ tenantId: delivery.tenantId, userId: delivery.userId, catalog: 'users' }]
        for (const [kind, table] of Object.entries(resourceTables)) {
            const rows = identities.parse(
                await manager.query(`SELECT id FROM ${table} WHERE "tenantId"=$1 AND "organizationId"=$2`, [
                    delivery.tenantId,
                    delivery.organizationId
                ])
            )
            for (const { id } of rows) {
                const scope = this.volumeScope(delivery.tenantId, kind, id)
                if (scope) scopes.push(scope)
            }
        }
        const tenantRoot = path.resolve(volumes.resolveRoot(delivery.tenantId).serverRoot)
        const roots = scopes.map((scope) => path.resolve(volumes.resolve(scope).serverRoot))
        const records = manager.getRepository(AppPlatformStorageRoot)
        for (const root of roots) {
            if (root === tenantRoot || !storageContains(tenantRoot, root))
                throw platformFailure('application_storage_scope_invalid', 403)
            const pathSuffix = path.relative(tenantRoot, root)
            const existing = await records.findOneBy({ tenantId: delivery.tenantId, pathSuffix })
            if (existing && existing.userId !== delivery.userId)
                throw platformFailure('application_storage_scope_invalid', 403)
            if (!existing)
                await records.save(
                    records.create({
                        tenantId: delivery.tenantId,
                        organizationId: delivery.organizationId,
                        userId: delivery.userId,
                        pathSuffix
                    })
                )
        }
        for (const retained of await records.findBy({ tenantId: delivery.tenantId, userId: delivery.userId })) {
            const root = path.resolve(tenantRoot, retained.pathSuffix)
            if (root === tenantRoot || !storageContains(tenantRoot, root))
                throw platformFailure('application_storage_scope_invalid', 403)
            roots.push(root)
        }
        const canonicalTenant = await canonicalStoragePath(tenantRoot)
        for (const root of roots) {
            if ((await canonicalStoragePath(root)) !== path.join(canonicalTenant, path.relative(tenantRoot, root)))
                throw platformFailure('application_storage_scope_invalid', 403)
        }
        return [...new Set(roots)]
    }

    private volumeScope(tenantId: string, kind: string, id: string): VolumeScope | null {
        switch (kind) {
            case 'project':
                return { tenantId, catalog: 'projects', projectId: id }
            case 'assistant':
                return { tenantId, catalog: 'xperts', xpertId: id, isolateByUser: false }
            case 'knowledge':
                return { tenantId, catalog: 'knowledges', knowledgeId: id }
            case 'workspace':
                return { tenantId, catalog: 'workspaces', workspaceId: id }
            default:
                return null
        }
    }

    private objectDigest(provider: string, key: string) {
        return createHash('sha256')
            .update(JSON.stringify([provider.toUpperCase(), key]))
            .digest('hex')
    }

    private async objects(manager: EntityManager, delivery: AppPlatformDelivery) {
        const rows = storedObjects.parse(
            await manager.query(
                `
            SELECT file AS key, coalesce("storageProvider",'LOCAL') AS provider, coalesce(size,0) AS bytes
              FROM storage_file WHERE "tenantId"=$1 AND "deletedAt" IS NULL
               AND ("organizationId"=$2 OR "createdById"=$3)
            UNION ALL
            SELECT artifact.metadata->>'storageKey' AS key, coalesce(source."storageProvider",'LOCAL') AS provider,
                   coalesce(artifact.metadata->>'size','0')::numeric AS bytes
              FROM file_artifact artifact JOIN file_asset asset ON asset.id=artifact."fileAssetId"
              LEFT JOIN storage_file source ON source.id=asset."storageFileId"
             WHERE asset."tenantId"=$1 AND asset."organizationId"=$2 AND artifact.metadata->>'storageKey' IS NOT NULL`,
                [delivery.tenantId, delivery.organizationId, delivery.userId]
            )
        )
        const tracked = await manager
            .getRepository(AppPlatformStorageObject)
            .findBy({ tenantId: delivery.tenantId, userId: delivery.userId })
        const result = new Map<string, number>()
        for (const object of [...rows, ...tracked]) {
            const digest = this.objectDigest(object.provider, object.key)
            result.set(digest, Math.max(object.bytes, result.get(digest) ?? 0))
        }
        return result
    }
}
