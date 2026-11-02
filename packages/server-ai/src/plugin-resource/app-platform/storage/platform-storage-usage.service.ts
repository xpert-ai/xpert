// Invariants: only reconciliation scans files and SQL payloads. Its lock prevents duplicate
// collectors, never serializes application writes. Snapshots intentionally permit concurrent overshoot.
import { Injectable } from '@nestjs/common'
import { StorageBudgetResource } from '@xpert-ai/server-core'
import { DataSource, EntityManager } from 'typeorm'
import path from 'node:path'
import { z } from 'zod/v3'
import { createRuntimeVolumeClient, VolumeScope } from '../../../shared/volume/volume'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { AppPlatformStorageRoot } from './platform-storage-object.entity'
import { canonicalStoragePath, measureStorageTrees, storageContains } from './storage-tree'
import { platformFailure } from '../platform-error'
const identities = z.array(z.object({ id: z.string().uuid() }))
const storedObjects = z.array(
    z.object({ key: z.string(), provider: z.string(), bytes: z.coerce.number().nonnegative().safe() })
)
const snapshots = z.array(
    z.object({
        externalBytes: z.coerce.number().nonnegative().safe(),
        databaseBytes: z.coerce.number().nonnegative().safe(),
        measuredAt: z.coerce.date().nullable(),
        refreshRequested: z.boolean()
    })
)
export type StorageUsageSnapshot = z.infer<typeof snapshots>[number]
export const STORAGE_REFRESH_INTERVAL_MS = 60_000
export const STORAGE_SNAPSHOT_MAX_AGE_MS = 300_000
const resourceTables = {
    project: 'xpert_project',
    assistant: 'xpert',
    knowledge: 'knowledgebase',
    workspace: 'xpert_workspace'
} as const

@Injectable()
export class PlatformStorageUsageService {
    constructor(private readonly database: DataSource) {}

    async snapshot(delivery: AppPlatformDelivery): Promise<StorageUsageSnapshot | null> {
        return (
            snapshots.parse(
                await this.database.query(
                    'SELECT "externalBytes","databaseBytes","measuredAt","refreshRequested" FROM app_platform_storage_usage WHERE "tenantId"=$1 AND "userId"=$2',
                    [delivery.tenantId, delivery.userId]
                )
            )[0] ?? null
        )
    }

    needsRefresh(delivery: AppPlatformDelivery, snapshot: StorageUsageSnapshot | null) {
        const limit =
            delivery.configuration.environment.plans[delivery.configuration.definition.entitlements.defaultPlanRef]
                .maxStorageBytes
        const age = snapshot?.measuredAt ? Date.now() - snapshot.measuredAt.getTime() : Infinity
        const interval =
            snapshot && snapshot.externalBytes + snapshot.databaseBytes >= limit * 0.9
                ? STORAGE_REFRESH_INTERVAL_MS
                : STORAGE_SNAPSHOT_MAX_AGE_MS
        return !snapshot || snapshot.refreshRequested || age >= interval
    }

    async requestRefresh(delivery: AppPlatformDelivery) {
        await this.database.query(
            `INSERT INTO app_platform_storage_usage ("tenantId","userId","refreshRequested") VALUES ($1,$2,true)
            ON CONFLICT ("tenantId","userId") DO UPDATE SET "refreshRequested"=true`,
            [delivery.tenantId, delivery.userId]
        )
    }

    async refresh(delivery: AppPlatformDelivery) {
        const runner = this.database.createQueryRunner()
        const key = `app-platform-storage-collector:${delivery.tenantId}:${delivery.userId}`
        let locked = false
        try {
            await runner.connect()
            const result = z
                .array(z.object({ locked: z.boolean() }))
                .parse(await runner.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [key]))
            locked = result[0]?.locked === true
            if (!locked) return
            const roots = await this.roots(runner.manager, delivery)
            const objects = await this.objects(runner.manager, delivery)
            const external =
                (await measureStorageTrees(roots)) + [...objects.values()].reduce((sum, bytes) => sum + bytes, 0)
            if (!Number.isSafeInteger(external)) throw platformFailure('application_storage_scope_invalid', 503)
            await runner.startTransaction()
            await runner.query('SELECT xpert_app_storage_reconcile_account($1,$2)', [
                delivery.tenantId,
                delivery.userId
            ])
            await runner.query(
                `UPDATE app_platform_storage_usage SET "externalBytes"=$3,"measuredAt"=clock_timestamp(),"refreshRequested"=false
                WHERE "tenantId"=$1 AND "userId"=$2`,
                [delivery.tenantId, delivery.userId, external]
            )
            await runner.commitTransaction()
        } catch (error) {
            if (runner.isTransactionActive) await runner.rollbackTransaction()
            throw error
        } finally {
            try {
                if (locked) await runner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key])
            } finally {
                await runner.release()
            }
        }
    }
    /** Only accept a root derived from the authorized resource, never another account's tenant sibling. */
    async validateSandboxRoot(delivery: AppPlatformDelivery, resource: StorageBudgetResource, requested: string) {
        if (!requested) throw platformFailure('application_storage_scope_invalid', 403)
        const volumes = createRuntimeVolumeClient()
        const scopes: VolumeScope[] = []
        if (resource.kind === 'user')
            scopes.push({ tenantId: delivery.tenantId, userId: delivery.userId, catalog: 'users' })
        else {
            const scope = this.volumeScope(delivery.tenantId, resource.kind, resource.id)
            if (scope) scopes.push(scope)
            if (resource.kind === 'assistant')
                scopes.push({
                    tenantId: delivery.tenantId,
                    userId: delivery.userId,
                    xpertId: resource.id,
                    catalog: 'user-xperts'
                })
        }
        const tenantRoot = path.resolve(volumes.resolveRoot(delivery.tenantId).serverRoot)
        const canonicalTenant = await canonicalStoragePath(tenantRoot)
        const root = await canonicalStoragePath(requested)
        for (const scope of scopes) {
            const expected = path.resolve(volumes.resolve(scope).serverRoot)
            if (expected === tenantRoot || !storageContains(tenantRoot, expected)) continue
            const canonicalExpected = await canonicalStoragePath(expected)
            if (canonicalExpected !== path.join(canonicalTenant, path.relative(tenantRoot, expected))) continue
            if (root === canonicalExpected) return root
        }
        throw platformFailure('application_storage_scope_invalid', 403)
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
                if (kind === 'assistant')
                    scopes.push({
                        tenantId: delivery.tenantId,
                        userId: delivery.userId,
                        xpertId: id,
                        catalog: 'user-xperts'
                    })
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
        const result = new Map<string, number>()
        for (const object of rows) {
            const digest = JSON.stringify([object.provider.toUpperCase(), object.key])
            result.set(digest, Math.max(object.bytes, result.get(digest) ?? 0))
        }
        return result
    }
}
