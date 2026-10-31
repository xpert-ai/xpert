import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, realpath, rm, writeFile, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { PlatformStorageUsageService } from './platform-storage-usage.service'
import * as volumes from '../../../shared/volume/volume'

function fixture(directory: string) {
    const owner = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const delivery = Object.assign(new AppPlatformDelivery(), {
        ...owner,
        configuration: {
            definition: { entitlements: { defaultPlanRef: 'trial' } },
            environment: { plans: { trial: { maxStorageBytes: 100 } } }
        }
    })
    class TestVolumes extends volumes.DevVolumeClient {
        override resolveRoot(tenant: string) {
            return {
                serverRoot: path.join(directory, tenant),
                hostRoot: path.join(directory, tenant),
                serverProvisioningRoot: directory
            }
        }
    }
    jest.spyOn(volumes, 'createRuntimeVolumeClient').mockImplementation(() => new TestVolumes())
    const records: Array<{ tenantId: string; userId: string; pathSuffix: string }> = []
    const repository = {
        findOneBy: jest.fn(async ({ pathSuffix }: { pathSuffix: string }) =>
            records.find((record) => record.pathSuffix === pathSuffix)
        ),
        findBy: jest.fn(async () => records),
        create: (value: (typeof records)[number]) => value,
        save: jest.fn(async (value: (typeof records)[number]) => {
            records.push(value)
            return value
        })
    }
    const objects = [
        { key: 'source', provider: 'local', bytes: 3 },
        { key: 'source', provider: 'LOCAL', bytes: 5 }
    ]
    const projects: Array<{ id: string }> = []
    const runner = {
        connect: jest.fn(),
        release: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        isTransactionActive: false,
        query: jest.fn(async (sql: string, _args?: unknown[]) =>
            sql.includes('pg_try_advisory_lock') ? [{ locked: true }] : []
        ),
        manager: {
            getRepository: () => repository,
            query: jest.fn(async (sql: string) =>
                sql.includes('SELECT file AS key') ? objects : sql.includes('FROM xpert_project') ? projects : []
            )
        }
    }
    const database = { createQueryRunner: () => runner, query: jest.fn() }
    const service = new PlatformStorageUsageService(database as never)
    const root = new TestVolumes().resolve({ ...owner, catalog: 'users' }).serverRoot
    return { owner, delivery, runner, database, records, objects, projects, service, root, volumes: new TestVolumes() }
}
describe('account storage measurement', () => {
    let directory: string
    beforeEach(async () => {
        directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'storage-snapshot-')))
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(directory, { force: true, recursive: true })
    })
    it('combines real files with deduplicated object metadata and releases the collector lock', async () => {
        const f = fixture(directory)
        await mkdir(f.root, { recursive: true })
        await writeFile(path.join(f.root, 'source'), '中文')
        await f.service.refresh(f.delivery)
        const update = f.runner.query.mock.calls.find(([sql]) => sql.includes('"externalBytes"=$3'))
        expect(update?.[1]).toEqual([f.owner.tenantId, f.owner.userId, 11])
        expect(f.runner.query.mock.calls.some(([sql]) => sql.includes('reconcile_account'))).toBe(true)
        expect(f.runner.query.mock.calls.at(-1)?.[0]).toContain('pg_advisory_unlock')
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })
    it('retains orphaned resource roots after their business rows are removed', async () => {
        const f = fixture(directory),
            id = randomUUID()
        f.projects.push({ id })
        const root = f.volumes.resolve({ tenantId: f.owner.tenantId, projectId: id, catalog: 'projects' }).serverRoot
        await mkdir(root, { recursive: true })
        await writeFile(path.join(root, 'retained'), '1234')
        await f.service.refresh(f.delivery)
        f.projects.length = 0
        f.runner.query.mockClear()
        await f.service.refresh(f.delivery)
        expect(f.runner.query.mock.calls.find(([sql]) => sql.includes('"externalBytes"=$3'))?.[1]?.[2]).toBe(9)
    })
    it('does not scan when another process holds the collector lock', async () => {
        const f = fixture(directory)
        f.runner.query.mockResolvedValueOnce([{ locked: false }])
        await f.service.refresh(f.delivery)
        expect(f.runner.manager.query).not.toHaveBeenCalled()
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })
    it('preserves the last snapshot and releases the lock after measurement failure', async () => {
        const f = fixture(directory)
        f.runner.manager.query.mockRejectedValueOnce(new Error('unavailable'))
        await expect(f.service.refresh(f.delivery)).rejects.toThrow('unavailable')
        expect(f.runner.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false)
        expect(f.runner.query.mock.calls.at(-1)?.[0]).toContain('pg_advisory_unlock')
    })
    it('allows only the exact authorized sandbox root, including symlink containment', async () => {
        const f = fixture(directory),
            resource = { ...f.owner, kind: 'user' as const }
        await mkdir(f.root, { recursive: true })
        await expect(f.service.validateSandboxRoot(f.delivery, resource, f.root)).resolves.toBe(f.root)
        const other = f.volumes.resolve({
            tenantId: f.owner.tenantId,
            userId: randomUUID(),
            catalog: 'users'
        }).serverRoot
        await expect(f.service.validateSandboxRoot(f.delivery, resource, other)).rejects.toMatchObject({ status: 403 })
        await rm(f.root, { recursive: true })
        await symlink(directory, f.root)
        await expect(f.service.validateSandboxRoot(f.delivery, resource, f.root)).rejects.toMatchObject({ status: 403 })
    })
    it('refreshes ordinary accounts every five minutes and near-limit or dirty accounts sooner', () => {
        const f = fixture(directory)
        const snapshot = {
            externalBytes: 10,
            databaseBytes: 0,
            measuredAt: new Date(Date.now() - 61_000),
            refreshRequested: false
        }
        expect(f.service.needsRefresh(f.delivery, snapshot)).toBe(false)
        expect(f.service.needsRefresh(f.delivery, { ...snapshot, externalBytes: 90 })).toBe(true)
        expect(f.service.needsRefresh(f.delivery, { ...snapshot, refreshRequested: true })).toBe(true)
        expect(f.service.needsRefresh(f.delivery, { ...snapshot, measuredAt: new Date(Date.now() - 301_000) })).toBe(
            true
        )
    })
})
