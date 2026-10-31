import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { withPlatformKnowledgeLifecycle } from './shared-resource-lifecycle'

const url = process.env.XPERT_APP_PLATFORM_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('shared knowledge resource lifecycle / PostgreSQL', () => {
    let database: DataSource
    const tenant = randomUUID()
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        database = await new DataSource({ type: 'postgres', url, entities: [], synchronize: false }).initialize()
    })
    afterAll(async () => database?.destroy())

    it('holds the same fence through binding or delete cleanup and releases it after failure', async () => {
        const observer = database.createQueryRunner()
        await observer.connect()
        await observer.startTransaction()
        const key = `app-platform-knowledge-lifecycle:${tenant}`
        try {
            await expect(
                withPlatformKnowledgeLifecycle(database.manager, tenant, async () => {
                    const rows: Array<{ locked: boolean }> = await observer.query(
                        'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked',
                        [key]
                    )
                    expect(rows[0].locked).toBe(false)
                    throw new Error('cleanup failed')
                })
            ).rejects.toThrow('cleanup failed')
            const rows: Array<{ locked: boolean }> = await observer.query(
                'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked',
                [key]
            )
            expect(rows[0].locked).toBe(true)
        } finally {
            await observer.rollbackTransaction()
            await observer.release()
        }
    })

    it('serializes consumers and deletion across independent database connections', async () => {
        let release: () => void
        const held = new Promise<void>((resolve) => {
            release = resolve
        })
        let entered: () => void
        const ready = new Promise<void>((resolve) => {
            entered = resolve
        })
        const order: string[] = []
        const binding = withPlatformKnowledgeLifecycle(database.manager, tenant, async () => {
            order.push('binding-validates-live-resource')
            entered()
            await held
            order.push('binding-persisted')
        })
        await ready
        const deletion = withPlatformKnowledgeLifecycle(database.manager, tenant, async () => {
            order.push('delete-rechecks-bindings')
            expect(order).toEqual(['binding-validates-live-resource', 'binding-persisted', 'delete-rechecks-bindings'])
        })
        release()
        await Promise.all([binding, deletion])
    })
})
