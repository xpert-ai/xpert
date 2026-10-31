import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DataSource } from 'typeorm'

const url = process.env.XPERT_APP_PLATFORM_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('account storage migration / PostgreSQL', () => {
    let admin: DataSource, database: DataSource
    const schema = `storage_migration_${randomUUID().replaceAll('-', '')}`
    const tenant = randomUUID(),
        user = randomUUID(),
        organization = randomUUID()
    const insert = (content: string) =>
        database.query('INSERT INTO business VALUES ($1,$2,$3,$4)', [randomUUID(), tenant, organization, content])
    const usage = async () =>
        (
            await database.query(
                'SELECT "databaseBytes"::int AS bytes FROM app_platform_storage_usage WHERE "tenantId"=$1 AND "userId"=$2',
                [tenant, user]
            )
        )[0]?.bytes ?? 0
    beforeAll(async () => {
        if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        admin = await new DataSource({ type: 'postgres', url, entities: [] }).initialize()
        await admin.query(`CREATE SCHEMA "${schema}"`)
        database = await new DataSource({
            type: 'postgres',
            url,
            entities: [],
            extra: { options: `-c search_path=${schema},public` }
        }).initialize()
        await database.query(
            'CREATE TABLE app_platform_delivery ("tenantId" uuid,"userId" uuid,"organizationId" uuid,configuration jsonb)'
        )
        await database.query('INSERT INTO app_platform_delivery VALUES ($1,$2,$3,$4)', [
            tenant,
            user,
            organization,
            {
                definition: { entitlements: { defaultPlanRef: 'trial' } },
                environment: { plans: { trial: { maxStorageBytes: 1000 } } }
            }
        ])
        await database.query(
            await readFile(path.join(__dirname, 'migrations/20261029100000-account-storage.sql'), 'utf8')
        )
        await database.query(
            'CREATE TABLE business (id uuid PRIMARY KEY,"tenantId" text,"organizationId" text,content text)'
        )
        await database.query("SELECT xpert_app_storage_register_relation('business'::regclass)")
    })
    beforeEach(async () => {
        await database.query('TRUNCATE business, app_platform_storage_usage')
    })
    afterAll(async () => {
        await database?.destroy()
        if (admin) {
            await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
            await admin.destroy()
        }
    })

    it('satisfies migration postconditions and registers each relation once', async () => {
        expect(
            await database.query(
                await readFile(path.join(__dirname, 'migrations/checks/20261029100000-account-storage.sql'), 'utf8')
            )
        ).toEqual([])
        await database.query("SELECT xpert_app_storage_register_relation('business'::regclass)")
        expect(await database.query('SELECT relation FROM app_platform_storage_relation')).toHaveLength(1)
        const triggers = await database.query(
            "SELECT tgname FROM pg_trigger WHERE tgrelid='business'::regclass AND NOT tgisinternal"
        )
        expect(triggers).toHaveLength(1)
    })

    it('shares capacity with file usage and permits shrinking and deletion', async () => {
        await database.query('INSERT INTO app_platform_storage_usage VALUES ($1,$2,600,0)', [tenant, user])
        await insert('a'.repeat(100))
        expect(await usage()).toBeGreaterThan(100)
        await expect(insert('b'.repeat(100))).rejects.toMatchObject({
            code: 'P0001',
            message: 'APP_PLATFORM_FAILURE:application_storage_limit'
        })
        await database.query("UPDATE business SET content='a'")
        await database.query('DELETE FROM business')
        expect(await usage()).toBe(0)
    })

    it('serializes concurrent inserts and rolls accounting back with SQL transactions', async () => {
        const results = await Promise.allSettled([insert('a'.repeat(400)), insert('b'.repeat(400))])
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        const before = await usage()
        await expect(
            database.transaction(async (manager) => {
                await manager.query('DELETE FROM business')
                throw new Error('abort')
            })
        ).rejects.toThrow('abort')
        expect(await usage()).toBe(before)
    })

    it('reconciles existing rows and excludes non-managed scopes', async () => {
        await insert('a'.repeat(100))
        const before = await usage()
        await database.query('INSERT INTO business VALUES ($1,$2,$3,$4)', [
            randomUUID(),
            'ordinary-tenant',
            'ordinary-org',
            'b'.repeat(2000)
        ])
        expect(await usage()).toBe(before)
        await database.query('TRUNCATE app_platform_storage_usage')
        await database.query('SELECT xpert_app_storage_reconcile_account($1,$2)', [tenant, user])
        expect(await usage()).toBe(before)
    })

    it('rechecks capacity at commit after a file write on another connection', async () => {
        await expect(
            database.transaction(async (manager) => {
                await manager.query('INSERT INTO business VALUES ($1,$2,$3,$4)', [
                    randomUUID(),
                    tenant,
                    organization,
                    'a'.repeat(500)
                ])
                await database.query('INSERT INTO app_platform_storage_usage VALUES ($1,$2,600,0)', [tenant, user])
            })
        ).rejects.toMatchObject({ code: 'P0001' })
        expect(await database.query('SELECT * FROM business')).toHaveLength(0)
        expect(await usage()).toBe(0)
    })
})
