import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, realpath, rm, writeFile, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { WithStorageBudgetCommand } from '@xpert-ai/server-core'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { WithStorageBudgetHandler } from './platform-storage-budget.handler'
import { AppPlatformStorageObject, AppPlatformStorageRoot } from './platform-storage-object.entity'
import * as volumes from '../../../shared/volume/volume'
import * as layout from '../../../shared/volume/volume-layout'

function fixture(directory: string) {
    const owner = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const policy = { maxStorageBytes: 12, maxTemporaryBytes: 16 }
    const delivery = Object.assign(new AppPlatformDelivery(), {
        id: randomUUID(),
        ...owner,
        configuration: {
            definition: { entitlements: { defaultPlanRef: 'trial' } },
            environment: { plans: { trial: policy } }
        }
    })
    const objects: AppPlatformStorageObject[] = [],
        roots: AppPlatformStorageRoot[] = []
    const metadata: Array<{ key: string; provider: string; bytes: number }> = []
    const usage = { databaseBytes: 0, externalBytes: 0 }
    const events: string[] = []
    const deliveries = {
        findOneBy: jest.fn().mockResolvedValue(delivery),
        existsBy: jest.fn().mockResolvedValue(false),
        findOneByOrFail: jest.fn().mockResolvedValue(delivery)
    }
    const objectRepository = {
        findBy: jest.fn(async () => objects),
        findOneBy: jest.fn(async ({ keyDigest }: { keyDigest: string }) =>
            objects.find((item) => item.keyDigest === keyDigest)
        ),
        create: jest.fn((input: Partial<AppPlatformStorageObject>) =>
            Object.assign(new AppPlatformStorageObject(), input)
        ),
        save: jest.fn(async (input: AppPlatformStorageObject) => {
            input.id ??= randomUUID()
            const index = objects.findIndex((item) => item.id === input.id)
            if (index < 0) objects.push(input)
            else objects[index] = input
            return input
        }),
        update: jest.fn(async (id: string, patch: Partial<AppPlatformStorageObject>) =>
            Object.assign(
                objects.find((item) => item.id === id),
                patch
            )
        ),
        delete: jest.fn(async (id: string) => {
            objects.splice(
                objects.findIndex((item) => item.id === id),
                1
            )
        })
    }
    const rootRepository = {
        findOneBy: jest.fn(async ({ pathSuffix }: { pathSuffix: string }) =>
            roots.find((item) => item.pathSuffix === pathSuffix)
        ),
        create: jest.fn((input: Partial<AppPlatformStorageRoot>) => Object.assign(new AppPlatformStorageRoot(), input)),
        save: jest.fn(async (input: AppPlatformStorageRoot) => {
            roots.push(input)
            return input
        }),
        findBy: jest.fn(async () => roots)
    }
    const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
        if (sql.includes('SELECT id FROM')) return []
        if (sql.includes('SELECT file AS key')) return metadata
        if (sql.includes('INSERT INTO app_platform_storage_usage')) {
            usage.externalBytes = Number(parameters[2])
            return [{ databaseBytes: usage.databaseBytes }]
        }
        throw new Error('Unexpected query')
    })
    const manager = {
        query,
        getRepository: jest.fn((entity) => {
            if (entity === AppPlatformDelivery) return deliveries
            if (entity === AppPlatformStorageObject) return objectRepository
            if (entity === AppPlatformStorageRoot) return rootRepository
            throw new Error('Unexpected repository')
        })
    }
    const runner = {
        manager,
        connect: jest.fn(),
        release: jest.fn(async () => {
            events.push('release')
        }),
        query: jest.fn(async (sql: string) => {
            events.push(sql.includes('pg_advisory_unlock') ? 'unlock' : 'lock')
        })
    }
    const database = { ...manager, createQueryRunner: jest.fn(() => runner) }
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
    jest.spyOn(layout, 'usesFlattenedSandboxVolumeLayout').mockReturnValue(false)
    const root = new TestVolumes().resolve({
        tenantId: owner.tenantId,
        userId: owner.userId,
        catalog: 'users'
    }).serverRoot
    const resource = { ...owner, kind: 'user' as const }
    const service = new WithStorageBudgetHandler(database as never)
    const file = (name: string, content: string) =>
        service.execute(
            new WithStorageBudgetCommand(
                { kind: 'file', resource, root, path: name, bytes: Buffer.byteLength(content) },
                async () => {
                    events.push('write')
                    await writeFile(path.join(root, name), content)
                }
            )
        )
    const object = (bytes: number, commit = async () => undefined) =>
        service.execute(
            new WithStorageBudgetCommand({ kind: 'object', owner, key: 'key', provider: 'local', bytes }, commit)
        )
    return {
        owner,
        policy,
        usage,
        objects,
        metadata,
        root,
        resource,
        service,
        runner,
        database,
        deliveries,
        events,
        file,
        object
    }
}

describe('account storage budget admission', () => {
    let directory: string
    beforeEach(async () => {
        directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'storage-budget-unit-')))
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(undefined)
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(directory, { recursive: true, force: true })
    })

    it('combines database and filesystem usage and admits replacements by their growth', async () => {
        const f = fixture(directory)
        await mkdir(f.root, { recursive: true })
        f.usage.databaseBytes = 4
        await f.file('document', '12345678')
        await expect(f.file('other', '1')).rejects.toMatchObject({ status: 413 })
        await f.file('document', '12')
        expect(f.usage.externalBytes).toBe(2)
        await f.file('other', '123456')
        expect(f.usage.externalBytes).toBe(8)
        expect(f.events.slice(0, 4)).toEqual(['lock', 'write', 'unlock', 'release'])
    })

    it('allows shrinking and deletion when a reduced limit is below existing usage', async () => {
        const f = fixture(directory)
        await mkdir(f.root, { recursive: true })
        await f.file('file', '12345678')
        f.policy.maxStorageBytes = 2
        await f.file('file', '1234')
        await expect(f.file('file', '12345')).rejects.toMatchObject({ status: 413 })
        await f.service.execute(
            new WithStorageBudgetCommand({ kind: 'remove', resource: f.resource, root: f.root }, () =>
                rm(path.join(f.root, 'file'))
            )
        )
        expect(f.usage.externalBytes).toBe(0)
    })

    it('retains uncertain object writes until deletion is confirmed', async () => {
        const f = fixture(directory)
        await expect(
            f.object(8, async () => {
                throw new Error('provider timeout')
            })
        ).rejects.toThrow('provider timeout')
        expect(f.objects[0]).toMatchObject({ bytes: 8, confirmed: false })
        expect(f.usage.externalBytes).toBe(8)
        const remove = (commit: () => Promise<void>) =>
            f.service.execute(
                new WithStorageBudgetCommand(
                    { kind: 'delete-object', owner: f.owner, provider: 'LOCAL', key: 'key' },
                    commit
                )
            )
        await expect(
            remove(async () => {
                throw new Error('delete failed')
            })
        ).rejects.toThrow('delete failed')
        expect(f.usage.externalBytes).toBe(8)
        await remove(async () => undefined)
        expect(f.usage.externalBytes).toBe(0)
    })

    it('deduplicates object metadata and releases capacity after a confirmed smaller overwrite', async () => {
        const f = fixture(directory)
        await f.object(8)
        f.metadata.push({ key: 'key', provider: 'LOCAL', bytes: 8 })
        await f.object(4, async () => {
            f.metadata[0].bytes = 4
        })
        expect(f.usage.externalBytes).toBe(4)
        expect(f.objects[0]).toMatchObject({ bytes: 4, confirmed: true })
    })

    it('reserves remaining capacity during sandbox work and refreshes actual usage before unlock', async () => {
        const f = fixture(directory)
        await mkdir(f.root, { recursive: true })
        await f.file('existing', '1234')
        f.usage.databaseBytes = 2
        await f.service.execute(
            new WithStorageBudgetCommand({ kind: 'sandbox', resource: f.resource, root: f.root }, async (allowance) => {
                expect(allowance).toEqual({ maxWorkspaceBytes: 10, maxTemporaryBytes: 16 })
                expect(f.usage.externalBytes).toBe(10)
                expect(f.events.at(-1)).toBe('lock')
                await writeFile(path.join(f.root, 'output'), '123')
            })
        )
        expect(f.usage.externalBytes).toBe(7)
        expect(f.events.slice(-2)).toEqual(['unlock', 'release'])
    })

    it.each([-1, 17, NaN, 1.5])('rejects invalid or excessive temporary bytes: %s', async (bytes) => {
        const f = fixture(directory),
            commit = jest.fn()
        await expect(
            f.service.execute(new WithStorageBudgetCommand({ kind: 'temporary', owner: f.owner, bytes }, commit))
        ).rejects.toMatchObject({ status: 413 })
        expect(commit).not.toHaveBeenCalled()
        expect(f.database.createQueryRunner).not.toHaveBeenCalled()
    })

    it('allows the temporary ceiling without consuming durable storage', async () => {
        const f = fixture(directory),
            commit = jest.fn(async () => 'ok')
        await expect(
            f.service.execute(new WithStorageBudgetCommand({ kind: 'temporary', owner: f.owner, bytes: 16 }, commit))
        ).resolves.toBe('ok')
        expect(f.database.createQueryRunner).not.toHaveBeenCalled()
    })

    it('leaves unmanaged accounts unchanged but refuses missing scope for a managed caller', async () => {
        const f = fixture(directory),
            commit = jest.fn(async () => 'ok')
        f.deliveries.findOneBy.mockResolvedValue(null)
        const command = new WithStorageBudgetCommand({ kind: 'temporary', owner: f.owner, bytes: 1000 }, commit)
        await expect(f.service.execute(command)).resolves.toBe('ok')
        jest.mocked(RequestContext.currentUserId).mockReturnValue(f.owner.userId)
        jest.mocked(RequestContext.currentTenantId).mockReturnValue(f.owner.tenantId)
        f.deliveries.existsBy.mockResolvedValue(true)
        commit.mockClear()
        await expect(f.service.execute(command)).rejects.toMatchObject({ status: 403 })
        expect(commit).not.toHaveBeenCalled()
    })

    it('rejects foreign and symlinked roots before running the write', async () => {
        const f = fixture(directory)
        await mkdir(f.root, { recursive: true })
        const outside = path.join(directory, 'outside')
        await mkdir(outside)
        await symlink(outside, path.join(f.root, 'redirect'))
        for (const root of [outside, path.join(f.root, 'redirect')]) {
            const commit = jest.fn()
            await expect(
                f.service.execute(new WithStorageBudgetCommand({ kind: 'sandbox', resource: f.resource, root }, commit))
            ).rejects.toMatchObject({ status: 403 })
            expect(commit).not.toHaveBeenCalled()
        }
    })

    it.each(['connect', 'lock'])('releases the connection without unlocking when %s fails', async (phase) => {
        const f = fixture(directory)
        if (phase === 'connect') f.runner.connect.mockRejectedValueOnce(new Error('database unavailable'))
        else f.runner.query.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(f.object(1)).rejects.toThrow('database unavailable')
        expect(f.events).not.toContain('unlock')
        expect(f.runner.release).toHaveBeenCalledTimes(1)
    })
})
