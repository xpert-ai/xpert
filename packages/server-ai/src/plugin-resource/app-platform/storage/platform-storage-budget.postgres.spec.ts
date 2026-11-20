import { membershipStorageTestSchemas } from '../../../membership/testing/membership-storage.test-schemas'
import { MembershipPlan } from '../../../membership/membership-plan.entity'
import { UserMembership } from '../../../membership/user-membership.entity'
import { MembershipPeriod } from '../../../membership/membership-period.entity'
import { createMembershipPlanSnapshot } from '../../../membership/membership-plan-snapshot'
import { MembershipStatusEnum, MembershipPeriodStatusEnum } from '@xpert-ai/contracts'
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
        new TestVolumes(commandVolumeWriteBudget(commands as never)).resolve({
            tenantId,
            organizationId,
            catalog: 'users',
            userId
        })
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
                ...membershipStorageTestSchemas,
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
        // An existing 10 GiB grant must survive conversion from account snapshots.
        await capacity(10 * 1024 ** 3)
        await database.query(
            'INSERT INTO app_platform_storage_usage ("tenantId","userId","externalBytes") VALUES ($1,$2,123)',
            [tenantId, userId]
        )
        const readOrganizationMigration = await readFile(
            path.join(__dirname, 'migrations/20261120120000-organization-storage.sql'),
            'utf8'
        )
        await database.transaction((manager) => manager.query(readOrganizationMigration))
        const legacyPlan = await database
            .getRepository(MembershipPlan)
            .save({ tenantId, organizationId, includedStorageBytes: 5 * 1024 ** 3 })
        await database.getRepository(UserMembership).save({
            ...owner,
            planId: legacyPlan.id,
            status: MembershipStatusEnum.Active,
            currentPeriodStart: new Date(Date.now() - 60_000),
            currentPeriodEnd: new Date(Date.now() + 60_000),
            planSnapshot: createMembershipPlanSnapshot(legacyPlan)
        })
        await database.query(
            await readFile(path.join(__dirname, 'migrations/20261120121000-organization-storage-grants.sql'), 'utf8')
        )
        collector = new PlatformStorageUsageService(database)
        expect(await collector.limit(await account())).toBe(10 * 1024 ** 3)
        expect(
            (
                await database.query(
                    'SELECT bytes::text FROM app_platform_storage_grant WHERE "tenantId"=$1 AND "organizationId"=$2',
                    [tenantId, organizationId]
                )
            )[0].bytes
        ).toBe(String(5 * 1024 ** 3))
        expect(
            (
                await database.query(
                    'SELECT "externalBytes"::int AS bytes FROM app_platform_storage_usage_legacy WHERE "tenantId"=$1 AND "userId"=$2',
                    [tenantId, userId]
                )
            )[0].bytes
        ).toBe(123)
        expect(await collector.snapshot(await account())).toMatchObject({ measuredAt: null, refreshRequested: true })
        service = new CheckStorageQuotaHandler(new StorageQuotaAccountResolver(database), collector)
    })
    beforeEach(async () => {
        for (const table of [
            'app_platform_storage_grant',
            'user_membership_period',
            'user_membership',
            'membership_plan',
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
            await database.query(`TRUNCATE ${table} CASCADE`)
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
                'SELECT "externalBytes"::int external,"databaseBytes"::int stored FROM app_platform_storage_usage WHERE "tenantId"=$1 AND "organizationId"=$2',
                [tenantId, organizationId]
            )
        )[0]

    const account = () => database.getRepository(AppPlatformDelivery).findOneByOrFail({ tenantId, userId })
    it('applies paid capacity immediately, isolates accounts and preserves files on expiry', async () => {
        await collector.refresh(await account())
        await volume().writeFile('retained', '1234567890123456')
        await collector.refresh(await account())
        await expect(volume().writeFile('blocked', '1')).rejects.toMatchObject({ status: 413 })
        const plan = await database
            .getRepository(MembershipPlan)
            .save({ tenantId, organizationId, includedStorageBytes: 40 })
        const start = new Date(Date.now() - 60_000),
            end = new Date(Date.now() + 60_000)
        const member = await database.getRepository(UserMembership).save({
            ...owner,
            planId: plan.id,
            status: MembershipStatusEnum.Active,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            planSnapshot: createMembershipPlanSnapshot(plan)
        })
        const period = await database.getRepository(MembershipPeriod).save({
            ...owner,
            membershipId: member.id,
            status: MembershipPeriodStatusEnum.Active,
            periodStart: start,
            periodEnd: end,
            planSnapshot: createMembershipPlanSnapshot(plan)
        })
        await database.getRepository(MembershipPlan).update(plan.id, { includedStorageBytes: 400 })
        expect(await collector.limit(await account())).toBe(40)
        expect(
            await collector.limit(
                await database.getRepository(AppPlatformDelivery).findOneByOrFail({ tenantId, userId: otherUser })
            )
        ).toBe(12)
        await volume().writeFile('paid', 'paid file')
        await collector.refresh(await account())
        const expired = new Date(Date.now() - 1)
        await database.getRepository(MembershipPeriod).update(period.id, { periodEnd: expired })
        await database.getRepository(UserMembership).update(member.id, { currentPeriodEnd: expired })
        expect(await collector.limit(await account())).toBe(12)
        await expect(volume().writeFile('blocked-again', '1')).rejects.toMatchObject({ status: 413 })
        expect(await readFile(path.join(volume().serverRoot, 'retained'), 'utf8')).toBe('1234567890123456')
        await volume().deleteFile('paid')
        await volume().writeFile('retained', 'smaller')
        expect(await readFile(path.join(volume().serverRoot, 'retained'), 'utf8')).toBe('smaller')
    })
    it('does not increase organization storage when members join, and retains purchased capacity when they leave', async () => {
        const plan = await database
            .getRepository(MembershipPlan)
            .save({ tenantId, organizationId, includedStorageBytes: 100 })
        const start = new Date(Date.now() - 60_000),
            end = new Date(Date.now() + 60_000)
        const { MembershipSourceEnum } = await import('@xpert-ai/contracts')
        const auto = await database.getRepository(UserMembership).save({
            ...owner,
            userId: otherUser,
            planId: plan.id,
            status: MembershipStatusEnum.Active,
            source: MembershipSourceEnum.Organization,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            planSnapshot: createMembershipPlanSnapshot(plan)
        })
        expect(await collector.limit(await account())).toBe(12)
        await database.getRepository(UserMembership).delete(auto.id)
        const buyer = await database.getRepository(UserMembership).save({
            ...owner,
            planId: plan.id,
            status: MembershipStatusEnum.Active,
            source: MembershipSourceEnum.External,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            planSnapshot: createMembershipPlanSnapshot(plan)
        })
        const period = await database.getRepository(MembershipPeriod).save({
            ...owner,
            membershipId: buyer.id,
            status: MembershipPeriodStatusEnum.Active,
            periodStart: start,
            periodEnd: end,
            planSnapshot: createMembershipPlanSnapshot(plan)
        })
        expect(await collector.limit(await account())).toBe(100)
        await database.transaction(async (manager) => {
            await manager.query("SELECT set_config('xpert.storage_member_removal','on',true)")
            await manager
                .getRepository(UserMembership)
                .update(buyer.id, { status: MembershipStatusEnum.Expired, currentPeriodEnd: new Date() })
            await manager
                .getRepository(MembershipPeriod)
                .update(period.id, { status: MembershipPeriodStatusEnum.Completed, periodEnd: new Date() })
        })
        expect(await collector.limit(await account())).toBe(100)
        // Explicit refund still revokes the organization benefit after purchaser removal.
        await database
            .getRepository(MembershipPeriod)
            .update(period.id, { status: MembershipPeriodStatusEnum.RefundPending })
        expect(await collector.limit(await account())).toBe(12)
    })
    it('takes the maximum of independent purchases, and still honors pause, resume, expiry and refunds', async () => {
        const plan = await database
            .getRepository(MembershipPlan)
            .save({ tenantId, organizationId, includedStorageBytes: 40 })
        const start = new Date(Date.now() - 60_000),
            end = new Date(Date.now() + 60_000)
        const membership = await database.getRepository(UserMembership).save({
            ...owner,
            planId: plan.id,
            status: MembershipStatusEnum.Active,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            planSnapshot: createMembershipPlanSnapshot(plan)
        })
        const period = await database.getRepository(MembershipPeriod).save({
            ...owner,
            membershipId: membership.id,
            status: MembershipPeriodStatusEnum.Active,
            periodStart: start,
            periodEnd: end,
            planSnapshot: createMembershipPlanSnapshot(plan)
        })
        await database.getRepository(UserMembership).save({
            ...owner,
            userId: otherUser,
            planId: plan.id,
            status: MembershipStatusEnum.Active,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            planSnapshot: createMembershipPlanSnapshot(plan)
        })
        expect(await collector.limit(await account())).toBe(40)
        await database
            .getRepository(MembershipPeriod)
            .update(period.id, { planSnapshot: { ...createMembershipPlanSnapshot(plan), includedStorageBytes: 80 } })
        expect(await collector.limit(await account())).toBe(80)
        await database.getRepository(UserMembership).update(membership.id, { status: MembershipStatusEnum.Paused })
        expect(await collector.limit(await account())).toBe(40)
        await database.getRepository(UserMembership).update(membership.id, { status: MembershipStatusEnum.Active })
        expect(await collector.limit(await account())).toBe(80)
        await database.getRepository(MembershipPeriod).update(period.id, { periodEnd: new Date(Date.now() - 1) })
        expect(await collector.limit(await account())).toBe(40)
    })
    it('separates persisted usage of two organizations even for the same uploader', async () => {
        await database.query(
            'INSERT INTO storage_file (id,"tenantId","organizationId","createdById",file,size) VALUES ($1,$2,$3,$4,$5,5),($6,$2,$7,$4,$8,9)',
            [randomUUID(), tenantId, organizationId, userId, 'a', randomUUID(), otherOrg, 'b']
        )
        await insert('own-data')
        await insert('foreign-data'.repeat(100), otherOrg)
        await collector.refresh(await account())
        const ownUsage = await usage()
        expect(ownUsage.external).toBe(5)
        const foreign = await database
            .getRepository(AppPlatformDelivery)
            .findOneByOrFail({ tenantId, organizationId: otherOrg })
        await collector.refresh(foreign)
        const foreignUsage = await collector.snapshot(foreign)
        expect(foreignUsage.externalBytes).toBe(9)
        expect(foreignUsage.databaseBytes).toBeGreaterThan(ownUsage.stored)
        expect((await usage()).external).toBe(5)
    })
    it('checks historical and new migration postconditions', async () => {
        for (const name of [
            '20261029100000-account-storage',
            '20261031120000-approximate-storage',
            '20261120120000-organization-storage',
            '20261120121000-organization-storage-grants'
        ])
            expect(
                await database.query(await readFile(path.join(__dirname, `migrations/checks/${name}.sql`), 'utf8'))
            ).toEqual([])
    })
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
        const key = `app-platform-storage-collector:${tenantId}:${organizationId}`
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
