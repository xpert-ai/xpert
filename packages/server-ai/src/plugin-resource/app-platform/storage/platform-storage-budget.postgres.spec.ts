import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DataSource, EntitySchema } from 'typeorm'
import { appPlatformDefinitionSchema, appPlatformEnvironmentSchema } from '@xpert-ai/contracts'
import { WithStorageBudgetCommand } from '@xpert-ai/server-core'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { AppPlatformStorageObject, AppPlatformStorageRoot } from './platform-storage-object.entity'
import { WithStorageBudgetHandler } from './platform-storage-budget.handler'
import * as volumes from '../../../shared/volume/volume'
import * as layout from '../../../shared/volume/volume-layout'
import { commandVolumeWriteBudget } from '../../../shared/volume/volume-write-budget'
import { VolumeWorkspaceStorage } from '../../../shared/volume/workspace-storage'

const url = process.env.XPERT_APP_PLATFORM_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('account cumulative storage / PostgreSQL and real filesystem', () => {
    let admin: DataSource, database: DataSource, service: WithStorageBudgetHandler, directory: string
    const schema = `storage_test_${randomUUID().replaceAll('-', '')}`
    const tenantId = randomUUID(),
        organizationId = randomUUID(),
        userId = randomUUID(),
        otherOrg = randomUUID(),
        otherUser = randomUUID(),
        projectId = randomUUID()
    const owner = { tenantId, organizationId, userId }
    const definition = appPlatformDefinitionSchema.parse({
        schemaVersion: 1,
        key: 'test',
        version: 1,
        branding: { name: 'Test' },
        registration: { role: 'APP_USER', organization: 'per-account' },
        apps: [
            {
                key: 'main',
                appRef: { pluginName: 'test', appName: 'main' },
                configurationRef: 'default',
                required: true
            }
        ],
        experience: { home: 'main', navigation: ['main'] },
        entitlements: { defaultPlanRef: 'trial' }
    })
    const environment = appPlatformEnvironmentSchema.parse({
        schemaVersion: 1,
        configurations: { default: { primary: { provider: 'test', model: 'test' } } },
        plans: {
            trial: {
                trialDays: 7,
                creditLimit: 100,
                maxProjects: 10,
                maxUploadBytes: 100,
                maxStorageBytes: 12,
                maxTemporaryBytes: 16,
                maxConcurrentRuns: 2
            }
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
    const commands = { execute: (command: WithStorageBudgetCommand<unknown>) => service.execute(command) }
    const volume = () =>
        new TestVolumes(commandVolumeWriteBudget(commands as never)).resolve({ tenantId, catalog: 'users', userId })
    const object = (key: string, bytes: number, commit = async () => undefined) =>
        service.execute(new WithStorageBudgetCommand({ kind: 'object', owner, provider: 'LOCAL', key, bytes }, commit))
    beforeAll(async () => {
        if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        directory = await realpath(await mkdtemp(path.join(tmpdir(), 'storage-budget-')))
        jest.spyOn(volumes, 'createRuntimeVolumeClient').mockImplementation(() => new TestVolumes())
        jest.spyOn(layout, 'usesFlattenedSandboxVolumeLayout').mockReturnValue(false)
        admin = await new DataSource({ type: 'postgres', url, entities: [] }).initialize()
        await admin.query(`CREATE SCHEMA "${schema}"`)
        const id = { type: 'uuid' as const, primary: true, generated: 'uuid' as const },
            uuid = { type: 'uuid' as const },
            text = { type: 'text' as const }
        const scope = { id, tenantId: uuid, organizationId: { ...uuid, nullable: true } }
        database = await new DataSource({
            type: 'postgres',
            url,
            schema,
            synchronize: true,
            extra: { options: `-c search_path=${schema},public` },
            entities: [
                new EntitySchema({
                    name: AppPlatformDelivery.name,
                    target: AppPlatformDelivery,
                    tableName: 'app_platform_delivery',
                    columns: {
                        ...scope,
                        userId: uuid,
                        configuration: { type: 'jsonb' }
                    }
                }),
                new EntitySchema({
                    name: AppPlatformStorageObject.name,
                    target: AppPlatformStorageObject,
                    tableName: 'app_platform_storage_object',
                    columns: {
                        ...scope,
                        userId: uuid,
                        keyDigest: text,
                        provider: text,
                        key: text,
                        bytes: { type: 'int' },
                        confirmed: { type: 'boolean' }
                    },
                    uniques: [{ columns: ['tenantId', 'keyDigest'] }]
                }),
                new EntitySchema({
                    name: AppPlatformStorageRoot.name,
                    target: AppPlatformStorageRoot,
                    tableName: 'app_platform_storage_root',
                    columns: {
                        ...scope,
                        userId: uuid,
                        pathSuffix: text
                    },
                    uniques: [{ columns: ['tenantId', 'pathSuffix'] }]
                })
            ]
        }).initialize()
        for (const table of ['xpert_project', 'xpert', 'knowledgebase', 'xpert_workspace'])
            await database.query(`CREATE TABLE ${table} (id uuid PRIMARY KEY,"tenantId" uuid,"organizationId" uuid)`)
        await database.query(
            'CREATE TABLE storage_file (id uuid PRIMARY KEY,"tenantId" uuid,"organizationId" uuid,"createdById" uuid,"deletedAt" timestamptz,file text,"storageProvider" text,size int)'
        )
        await database.query(
            'CREATE TABLE file_asset (id uuid PRIMARY KEY,"tenantId" uuid,"organizationId" uuid,"storageFileId" uuid)'
        )
        await database.query('CREATE TABLE file_artifact (id uuid PRIMARY KEY,"fileAssetId" uuid,metadata jsonb)')
        await database.query(
            await readFile(path.join(__dirname, 'migrations/20261029100000-account-storage.sql'), 'utf8')
        )
        await database.query(
            'CREATE TABLE plugin_test_business (id uuid PRIMARY KEY,"tenantId" varchar,"organizationId" varchar,content text)'
        )
        await database.query("SELECT xpert_app_storage_register_relation('plugin_test_business'::regclass)")
        await database.query('CREATE TABLE test_vectors (id uuid PRIMARY KEY,metadata jsonb,content text)')
        await database.query("SELECT xpert_app_storage_register_relation('test_vectors'::regclass,'metadata')")
        await database.getRepository(AppPlatformDelivery).save([
            { tenantId, organizationId, userId, configuration: { definition, environment, digest: 'a'.repeat(64) } },
            {
                tenantId,
                organizationId: otherOrg,
                userId: otherUser,
                configuration: { definition, environment, digest: 'b'.repeat(64) }
            }
        ])
        service = new WithStorageBudgetHandler(database)
    })
    beforeEach(async () => {
        for (const table of [
            'test_vectors',
            'plugin_test_business',
            'app_platform_storage_usage',
            'app_platform_storage_object',
            'app_platform_storage_root',
            'storage_file',
            'file_artifact',
            'file_asset',
            'xpert_project'
        ])
            await database.query(`TRUNCATE ${table}`)
        await rm(path.join(directory, tenantId), { recursive: true, force: true })
        await capacity(12)
    })
    const capacity = (bytes: number) =>
        database.query(
            `UPDATE app_platform_delivery SET configuration=jsonb_set(configuration,'{environment,plans,trial,maxStorageBytes}',$1::jsonb)`,
            [String(bytes)]
        )
    const insert = (content: string, org = organizationId, id = randomUUID()) =>
        database.query('INSERT INTO plugin_test_business VALUES ($1,$2,$3,$4) RETURNING id', [
            id,
            tenantId,
            org,
            content
        ])
    const usage = async () =>
        (
            await database.query(
                'SELECT "externalBytes"::int external,"databaseBytes"::int stored FROM app_platform_storage_usage WHERE "tenantId"=$1 AND "userId"=$2',
                [tenantId, userId]
            )
        )[0]

    it('counts actual plugin database rows and files against one account capacity', async () => {
        await capacity(1000)
        await volume().writeFile('source', 'a'.repeat(600))
        await insert('a'.repeat(100))
        expect((await usage()).stored).toBeGreaterThan(100)
        await expect(insert('b'.repeat(100))).rejects.toMatchObject({
            code: 'P0001',
            message: 'APP_PLATFORM_FAILURE:application_storage_limit'
        })
        await expect(volume().writeFile('export', 'c'.repeat(500))).rejects.toMatchObject({ status: 413 })
        await volume().deleteFile('source')
        expect((await usage()).external).toBe(0)
        await expect(insert('b'.repeat(100))).resolves.toHaveLength(1)
    })
    it('serializes concurrent raw SQL inserts and rolls back usage with the transaction', async () => {
        await capacity(1000)
        const results = await Promise.allSettled([insert('a'.repeat(400)), insert('b'.repeat(400))])
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        const before = await usage()
        await expect(
            database.transaction(async (manager) => {
                await manager.query('DELETE FROM plugin_test_business')
                throw new Error('abort')
            })
        ).rejects.toThrow('abort')
        expect(await usage()).toEqual(before)
        await database.query('DELETE FROM plugin_test_business')
        expect((await usage()).stored).toBe(0)
    })
    it('allows reads, shrinking and deletion after lowering capacity below existing usage', async () => {
        await capacity(1000)
        await insert('a'.repeat(400))
        await capacity(12)
        await expect(database.query('SELECT * FROM plugin_test_business')).resolves.toHaveLength(1)
        await expect(database.query("UPDATE plugin_test_business SET content='a'")).resolves.toBeDefined()
        await expect(database.query("UPDATE plugin_test_business SET content='ab'")).rejects.toMatchObject({
            code: 'P0001'
        })
        await database.query('DELETE FROM plugin_test_business')
        expect((await usage()).stored).toBe(0)
    })
    it('charges moves to the new account and restores registered data on reconciliation', async () => {
        await capacity(1000)
        await insert('a'.repeat(400))
        await insert('b'.repeat(400), otherOrg)
        await expect(
            database.query('UPDATE plugin_test_business SET "organizationId"=$1 WHERE "organizationId"=$2', [
                otherOrg,
                organizationId
            ])
        ).rejects.toMatchObject({ code: 'P0001' })
        await database.query('DELETE FROM plugin_test_business WHERE "organizationId"=$1', [otherOrg])
        await database.query('UPDATE plugin_test_business SET "organizationId"=$1 WHERE "organizationId"=$2', [
            otherOrg,
            organizationId
        ])
        expect((await usage()).stored).toBe(0)
        await database.query('TRUNCATE app_platform_storage_usage')
        await database.query('SELECT xpert_app_storage_reconcile_account($1,$2)', [tenantId, otherUser])
        const rows = await database.query(
            'SELECT "databaseBytes"::int bytes FROM app_platform_storage_usage WHERE "userId"=$1',
            [otherUser]
        )
        expect(rows[0].bytes).toBeGreaterThan(400)
    })
    it('leaves ordinary non-managed plugin scopes unchanged', async () => {
        await database.query('INSERT INTO plugin_test_business VALUES ($1,$2,$3,$4)', [
            randomUUID(),
            'non-uuid-tenant',
            'ordinary-scope',
            'a'.repeat(2000)
        ])
        expect(await usage()).toBeUndefined()
    })
    it('counts vector payloads using their declared organization metadata scope', async () => {
        await capacity(1000)
        await database.query('INSERT INTO test_vectors VALUES ($1,$2,$3)', [randomUUID(), owner, 'v'.repeat(500)])
        const before = await usage()
        expect(before.stored).toBeGreaterThan(500)
        await expect(volume().writeFile('too-large', 'a'.repeat(500))).rejects.toMatchObject({ status: 413 })
        await database.query('SELECT xpert_app_storage_reconcile_account($1,$2)', [tenantId, userId])
        expect(await usage()).toEqual(before)
        await database.query('DELETE FROM test_vectors')
        expect((await usage()).stored).toBe(0)
    })
    it('admits files inside plugin SQL transactions without cross-connection deadlock', async () => {
        await capacity(1000)
        await database.transaction(async (manager) => {
            await manager.query('INSERT INTO plugin_test_business VALUES ($1,$2,$3,$4)', [
                randomUUID(),
                tenantId,
                organizationId,
                'a'.repeat(100)
            ])
            await volume().writeFile('inside-transaction', 'b'.repeat(500))
        })
        expect((await usage()).external).toBe(500)
        expect((await usage()).stored).toBeGreaterThan(100)
    }, 5000)
    it('rejects the SQL commit if files consumed the pending database capacity', async () => {
        await capacity(1000)
        await expect(
            database.transaction(async (manager) => {
                await manager.query('INSERT INTO plugin_test_business VALUES ($1,$2,$3,$4)', [
                    randomUUID(),
                    tenantId,
                    organizationId,
                    'a'.repeat(500)
                ])
                await volume().writeFile('retained-file', 'b'.repeat(600))
            })
        ).rejects.toMatchObject({ code: 'P0001' })
        expect(await database.query('SELECT * FROM plugin_test_business')).toHaveLength(0)
        expect(await usage()).toEqual({ external: 600, stored: 0 })
        await expect(volume().writeFile('over-limit', 'c'.repeat(401))).rejects.toMatchObject({ status: 413 })
    }, 5000)
    afterAll(async () => {
        jest.restoreAllMocks()
        await database?.destroy()
        if (admin) {
            await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
            await admin.destroy()
        }
        if (directory) await rm(directory, { recursive: true, force: true })
    })
    it('atomically admits only one of two writes sharing an account across Apps', async () => {
        const results = await Promise.allSettled([
            volume().writeFile('app-a.txt', '1234567'),
            volume().writeFile('app-b.txt', '1234567')
        ])
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    })
    it('counts uploaded originals, PDF page images, generated files and application state together', async () => {
        const sourceId = randomUUID(),
            assetId = randomUUID()
        await database.query('INSERT INTO storage_file VALUES ($1,$2,$3,$4,NULL,$5,$6,3)', [
            sourceId,
            tenantId,
            organizationId,
            userId,
            'original',
            'LOCAL'
        ])
        await database.query('INSERT INTO file_asset VALUES ($1,$2,$3,$4)', [
            assetId,
            tenantId,
            organizationId,
            sourceId
        ])
        await database.query('INSERT INTO file_artifact VALUES ($1,$2,$3)', [
            randomUUID(),
            assetId,
            { storageKey: 'page', size: 3 }
        ])
        const app = new VolumeWorkspaceStorage(async () => volume(), 'test')
        await app.write('state.json', '123')
        await volume().writeFile('export.txt', '123')
        await expect(volume().writeFile('overflow', '1')).rejects.toMatchObject({ status: 413 })
    })
    it('uses replacement deltas and frees physically deleted files', async () => {
        await volume().writeFile('document', '123456789012')
        await expect(volume().writeFile('document', '1234567890123')).rejects.toMatchObject({ status: 413 })
        expect(await readFile(volume().path('document'), 'utf8')).toBe('123456789012')
        await volume().writeFile('document', '1')
        await volume().writeFile('second', '12345678901')
        await volumes.VolumeHandle.removePath(volume().serverRoot, 'second', { boundaryRoot: volume().serverRoot })
        await expect(volume().writeFile('third', '12345678901')).resolves.toBe(true)
    })
    it('keeps uncertain provider writes charged and releases only confirmed deletion', async () => {
        await expect(
            object('pending', 8, async () => {
                throw new Error('unknown outcome')
            })
        ).rejects.toThrow('unknown outcome')
        await expect(volume().writeFile('new', '12345')).rejects.toMatchObject({ status: 413 })
        const remove = (commit: () => Promise<void>) =>
            service.execute(
                new WithStorageBudgetCommand(
                    { kind: 'delete-object', owner, provider: 'LOCAL', key: 'pending' },
                    commit
                )
            )
        await expect(
            remove(async () => {
                throw new Error('not confirmed')
            })
        ).rejects.toThrow('not confirmed')
        await expect(volume().writeFile('new', '12345')).rejects.toMatchObject({ status: 413 })
        await remove(async () => undefined)
        await expect(volume().writeFile('new', '123456789012')).resolves.toBe(true)
    })
    it('does not double count a tracked object and its persisted metadata', async () => {
        await object('original', 8, async () => {
            await database.query('INSERT INTO storage_file VALUES ($1,$2,$3,$4,NULL,$5,$6,8)', [
                randomUUID(),
                tenantId,
                organizationId,
                userId,
                'original',
                'LOCAL'
            ])
        })
        await expect(volume().writeFile('rest', '1234')).resolves.toBe(true)
        await expect(volume().writeFile('overflow', '1')).rejects.toMatchObject({ status: 413 })
    })
    it('keeps retained Project files counted after removal of Project metadata', async () => {
        await database.query('INSERT INTO xpert_project VALUES ($1,$2,$3)', [projectId, tenantId, organizationId])
        const project = new TestVolumes(commandVolumeWriteBudget(commands as never)).resolve({
            tenantId,
            catalog: 'projects',
            projectId
        })
        await project.writeFile('retained', '12345678')
        await database.query('DELETE FROM xpert_project WHERE id=$1', [projectId])
        await expect(volume().writeFile('overflow', '12345')).rejects.toMatchObject({ status: 413 })
    })
    it('denies a foreign root and keeps account budgets independent', async () => {
        const other = new TestVolumes(commandVolumeWriteBudget(commands as never)).resolve({
            tenantId,
            catalog: 'users',
            userId: otherUser
        })
        await other.writeFile('private', '123456789012')
        await expect(volume().writeFile('own', '123456789012')).resolves.toBe(true)
        await expect(
            service.execute(
                new WithStorageBudgetCommand(
                    { kind: 'sandbox', resource: { ...owner, kind: 'user' }, root: other.serverRoot },
                    async () => undefined
                )
            )
        ).rejects.toMatchObject({ status: 403 })
    })
    it('holds the account lock until sandbox publication and passes only remaining capacity', async () => {
        await volume().writeFile('existing', '1234')
        let concurrent: Promise<PromiseSettledResult<boolean>[]> | undefined
        await service.execute(
            new WithStorageBudgetCommand(
                { kind: 'sandbox', resource: { ...owner, kind: 'user' }, root: volume().serverRoot },
                async (allowance) => {
                    expect(allowance).toEqual({ maxWorkspaceBytes: 12, maxTemporaryBytes: 16 })
                    concurrent = Promise.allSettled([volume().writeFile('concurrent', '12345678')])
                    // Give the second database connection time to contend while publication is pending.
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    await writeFile(volume().path('output'), '12345678')
                }
            )
        )
        expect(await concurrent).toEqual([
            expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ status: 413 }) })
        ])
    })
    it('keeps createOnly initialization idempotent when the account is full', async () => {
        await volume().writeFile('project.md', '123456789012')
        await expect(volume().writeFile('project.md', 'longer replacement', { createOnly: true })).resolves.toBe(false)
        expect(await readFile(volume().path('project.md'), 'utf8')).toBe('123456789012')
    })
    it('rejects a sandbox root redirected through a symlink', async () => {
        await volume().writeFile('existing', '1')
        const outside = path.join(directory, 'outside')
        await mkdir(outside, { recursive: true })
        await symlink(outside, volume().path('redirect'))
        const commit = jest.fn(async () => undefined)
        await expect(
            service.execute(
                new WithStorageBudgetCommand(
                    { kind: 'sandbox', resource: { ...owner, kind: 'user' }, root: volume().path('redirect') },
                    commit
                )
            )
        ).rejects.toMatchObject({ status: 403 })
        expect(commit).not.toHaveBeenCalled()
    })
    it('rejects a temporary Runtime profile above the account ceiling', async () => {
        const commit = jest.fn(async () => undefined)
        await expect(
            service.execute(new WithStorageBudgetCommand({ kind: 'temporary', owner, bytes: 17 }, commit))
        ).rejects.toMatchObject({ status: 413 })
        expect(commit).not.toHaveBeenCalled()
        await expect(
            service.execute(new WithStorageBudgetCommand({ kind: 'temporary', owner, bytes: 16 }, commit))
        ).resolves.toBeUndefined()
    })
})
