import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DataSource, EntitySchema } from 'typeorm'
import { appPlatformDefinitionSchema, appPlatformEnvironmentSchema } from '@xpert-ai/contracts'
import { CheckStorageQuotaCommand, RequestStorageUsageRefreshCommand } from '@xpert-ai/server-core'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import { AppPlatformStorageObject, AppPlatformStorageRoot } from './platform-storage-object.entity'
import { CheckStorageQuotaHandler, StorageQuotaAccountResolver } from './platform-storage-budget.handler'
import { PlatformStorageUsageService } from './platform-storage-usage.service'
import * as volumes from '../../../shared/volume/volume'
import * as layout from '../../../shared/volume/volume-layout'
import { commandVolumeWriteBudget } from '../../../shared/volume/volume-write-budget'

const url = process.env.XPERT_APP_PLATFORM_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('account cumulative storage / PostgreSQL and real filesystem', () => {
    let admin: DataSource,
        database: DataSource,
        service: CheckStorageQuotaHandler,
        collector: PlatformStorageUsageService,
        directory: string
    const schema = `storage_test_${randomUUID().replaceAll('-', '')}`
    const tenantId = randomUUID(),
        organizationId = randomUUID(),
        userId = randomUUID(),
        otherOrg = randomUUID(),
        otherUser = randomUUID()
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
    const commands = {
        execute: async (command: CheckStorageQuotaCommand | RequestStorageUsageRefreshCommand) => {
            if (command instanceof CheckStorageQuotaCommand) return service.execute(command)
            await collector.requestRefresh(await account())
            return null
        }
    }
    const volume = () =>
        new TestVolumes(commandVolumeWriteBudget(commands as never)).resolve({ tenantId, catalog: 'users', userId })
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
        await database.query(
            await readFile(path.join(__dirname, 'migrations/20261031120000-approximate-storage.sql'), 'utf8')
        )
        collector = new PlatformStorageUsageService(database)
        service = new CheckStorageQuotaHandler(new StorageQuotaAccountResolver(database), collector)
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

    const account = () => database.getRepository(AppPlatformDelivery).findOneByOrFail({ tenantId, userId })
    it('detaches historical triggers and allows SQL writes above quota until reconciliation', async () => {
        await insert('a'.repeat(100))
        await insert('b'.repeat(100))
        const triggers = await database.query(
            "SELECT tgname FROM pg_trigger WHERE tgfoid='xpert_app_storage_row_guard()'::regprocedure AND NOT tgisinternal"
        )
        expect(triggers).toEqual([])
        await collector.refresh(await account())
        expect((await usage()).stored).toBeGreaterThan(200)
        await expect(
            service.execute(new CheckStorageQuotaCommand({ kind: 'run', scope: owner }))
        ).rejects.toMatchObject({ status: 413 })
    })
    it('allows concurrent file overshoot, then rejects further growth after measurement', async () => {
        await collector.refresh(await account())
        await Promise.all([volume().writeFile('a', '12345678'), volume().writeFile('b', '12345678')])
        await collector.refresh(await account())
        expect((await usage()).external).toBe(16)
        await expect(volume().writeFile('c', '1')).rejects.toMatchObject({ status: 413 })
        await volume().writeFile('a', '1')
        await volume().deleteFile('b')
        await collector.refresh(await account())
        expect((await usage()).external).toBe(1)
        await volume().writeFile('c', '1')
    })
    it('keeps ordinary SQL commits independent of the collector advisory lock', async () => {
        const runner = database.createQueryRunner()
        await runner.connect()
        const key = `app-platform-storage-collector:${tenantId}:${userId}`
        await runner.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key])
        try {
            await database.transaction(async (manager) => {
                await manager.query("SET LOCAL lock_timeout='500ms'")
                await manager.query('INSERT INTO plugin_test_business VALUES ($1,$2,$3,$4)', [
                    randomUUID(),
                    tenantId,
                    organizationId,
                    'output'
                ])
            })
        } finally {
            await runner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key])
            await runner.release()
        }
    })
    it('continues inventory registration without reinstalling row guards', async () => {
        await database.query("SELECT xpert_app_storage_register_relation('test_vectors'::regclass,'metadata')")
        const issues = await database.query(
            await readFile(path.join(__dirname, 'migrations/checks/20261031120000-approximate-storage.sql'), 'utf8')
        )
        expect(issues).toEqual([])
    })
    afterAll(async () => {
        jest.restoreAllMocks()
        await database?.destroy()
        if (admin?.isInitialized) {
            await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
            await admin.destroy()
        }
        if (directory) await rm(directory, { recursive: true, force: true })
    })
})
