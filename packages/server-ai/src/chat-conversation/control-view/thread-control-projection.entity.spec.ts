import type { IThreadControlProjection } from '@xpert-ai/contracts'
import { threadControlViewSchema } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { mcpTestEntities } from '../../mcp-publication/testing/database'
import { principal } from '../../mcp-publication/testing/fixtures'
import { viewFixture } from './testing/view.test-fixture'
import { ThreadControlProjection } from './thread-control-projection.entity'

class MetadataDataSource extends DataSource {
    buildEntityMetadata() {
        return this.buildMetadatas()
    }
}
it('inherits one UUID primary key, audit fields and scope relations while keeping thread identity unique', async () => {
    const db = new MetadataDataSource({ type: 'postgres', entities: [...mcpTestEntities, ThreadControlProjection] })
    await db.buildEntityMetadata()
    const entity: IThreadControlProjection = new ThreadControlProjection()
    expect(entity).toBeInstanceOf(TenantOrganizationBaseEntity)
    const metadata = db.getMetadata(ThreadControlProjection)
    expect(metadata.primaryColumns.map((column) => column.propertyName)).toEqual(['id'])
    expect(metadata.primaryColumns[0].generationStrategy).toBe('uuid')
    expect(metadata.createDateColumn.propertyName).toBe('createdAt')
    expect(metadata.updateDateColumn.propertyName).toBe('updatedAt')
    expect(metadata.relations.map((relation) => relation.propertyName).sort()).toEqual([
        'createdBy',
        'organization',
        'tenant',
        'updatedBy'
    ])
    expect(metadata.indices.find((index) => index.name === 'IDX_thread_control_projection_thread')).toMatchObject({
        isUnique: true,
        givenColumnNames: ['threadId']
    })
})

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const migration = readFileSync(join(__dirname, 'migration.sql'), 'utf8')
const legacy = `CREATE TABLE chat_thread_control_projection (
    "threadId" varchar(100) PRIMARY KEY, "tenantId" uuid NOT NULL, "organizationId" uuid,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0), fingerprint varchar(64) NOT NULL
)`
integration.each(['fresh', 'legacy'] as const)('thread projection %s schema / PostgreSQL', (mode) => {
    let f: Awaited<ReturnType<typeof viewFixture>>
    const revision = '9007199254740993',
        fingerprint = 'a'.repeat(64)
    beforeEach(async () => {
        f = await viewFixture(url)
        await f.db.query('DROP TABLE chat_thread_control_projection')
        if (mode === 'legacy') {
            await f.db.query(legacy)
            await f.db.query(
                `INSERT INTO chat_thread_control_projection ("threadId","tenantId","organizationId",revision,fingerprint)
                 VALUES ($1,$2,$3,$4,$5)`,
                [f.threadId, f.tenant.tenantId, f.tenant.organizationId, revision, fingerprint]
            )
        }
        await f.db.query(migration)
        await f.db.query(migration)
        if (mode === 'fresh')
            await f.db.getRepository(ThreadControlProjection).save({
                ...f.tenant,
                threadId: f.threadId,
                revision,
                fingerprint
            })
    })
    afterEach(async () => {
        if (f) await f.close()
    })

    it('aligns migrated columns, primary key, uniqueness and foreign keys with the inherited entity', async () => {
        const db = f.db,
            runner = db.createQueryRunner()
        try {
            const metadata = db.getMetadata(ThreadControlProjection)
            const table = await runner.getTable(`${metadata.schema}.${metadata.tableName}`)
            expect(table.primaryColumns.map((column) => column.name)).toEqual(['id'])
            expect(table.primaryColumns[0].generationStrategy).toBe('uuid')
            const defaults = await db.query<Array<{ column_default: string }>>(
                'SELECT column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3',
                [metadata.schema, metadata.tableName, 'id']
            )
            expect(defaults[0].column_default).toContain('gen_random_uuid')
            expect(table.columns.map((column) => column.name).sort()).toEqual(
                metadata.columns.map((column) => column.databaseName).sort()
            )
            for (const column of metadata.columns) {
                const actual = table.columns.find((candidate) => candidate.name === column.databaseName)
                expect(actual.type).toBe(db.driver.normalizeType(column))
                expect(actual.isNullable).toBe(column.isNullable)
                expect(actual.length).toBe(column.length)
            }
            expect(table.foreignKeys.map((key) => [key.columnNames[0], key.onDelete, key.onUpdate]).sort()).toEqual([
                ['createdById', 'RESTRICT', 'NO ACTION'],
                ['organizationId', 'CASCADE', 'CASCADE'],
                ['tenantId', 'CASCADE', 'NO ACTION'],
                ['updatedById', 'RESTRICT', 'NO ACTION']
            ])
            expect(table.indices.map((index) => index.columnNames)).toEqual(
                expect.arrayContaining([['tenantId'], ['organizationId'], ['threadId']])
            )
            expect(table.indices.find((index) => index.name === 'IDX_thread_control_projection_thread').isUnique).toBe(
                true
            )
        } finally {
            await runner.release()
        }
    })

    it('preserves exact revision and fingerprint across repeat migration and rejects duplicate thread clocks', async () => {
        const repository = f.db.getRepository(ThreadControlProjection)
        const before = await repository.findOneByOrFail({ threadId: f.threadId })
        expect(before).toMatchObject({ ...f.tenant, threadId: f.threadId, revision, fingerprint })
        expect(before.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(before.createdAt).toBeInstanceOf(Date)
        expect(before.updatedAt).toBeInstanceOf(Date)
        expect(before.createdById).toBeNull()
        expect(before.updatedById).toBeNull()
        await f.db.query(migration)
        expect(await repository.findOneByOrFail({ threadId: f.threadId })).toEqual(before)
        await expect(repository.insert({ ...before, id: randomUUID() })).rejects.toMatchObject({ code: '23505' })
        expect(await repository.count()).toBe(1)
    })

    it('loads inherited audit and scope relations without changing the presentation clock', async () => {
        const repository = f.db.getRepository(ThreadControlProjection)
        const row = await repository.findOneByOrFail({ threadId: f.threadId })
        await repository.save({ id: row.id, createdById: principal().userId, updatedById: principal().userId })
        expect(
            await repository.findOneOrFail({
                where: { id: row.id },
                relations: { createdBy: true, updatedBy: true, tenant: true, organization: true }
            })
        ).toMatchObject({
            id: row.id,
            revision,
            fingerprint,
            tenant: { id: f.tenant.tenantId },
            organization: { id: f.tenant.organizationId },
            createdBy: { id: principal().userId },
            updatedBy: { id: principal().userId }
        })
        await expect(repository.update(row.id, { tenantId: randomUUID() })).rejects.toMatchObject({ code: '23503' })
    })

    it('updates the same inherited record across state changes without resetting the clock or exposing audit fields', async () => {
        const repository = f.db.getRepository(ThreadControlProjection)
        const original = await repository.findOneByOrFail({ threadId: f.threadId })
        await repository.save({ id: original.id, createdById: principal().userId })
        const running = (await f.views.read(f.threadId)).controlView
        expect(running.revision).toBe('9007199254740994')
        expect((await f.makeView().read(f.threadId)).controlView).toEqual(running)
        await f.pause()
        const paused = (await f.makeView().read(f.threadId)).controlView
        expect(paused).toMatchObject({ state: 'paused', revision: '9007199254740995', actions: { canResume: true } })
        const updated = await repository.findOneByOrFail({ threadId: f.threadId })
        expect(updated).toMatchObject({ id: original.id, createdAt: original.createdAt, createdById: principal().userId })
        expect(updated.fingerprint).not.toBe(fingerprint)
        expect(await repository.count()).toBe(1)
        threadControlViewSchema.parse(paused)
        expect(Object.keys(paused)).not.toEqual(
            expect.arrayContaining(['id', 'tenantId', 'organizationId', 'createdAt', 'createdById'])
        )
        for (const field of ['id', 'tenantId', 'organizationId', 'createdAt', 'updatedAt', 'createdById', 'updatedById'])
            expect(paused).not.toHaveProperty(field)
    })

    it('rejects a missing tenant before opening a projection transaction', async () => {
        f.conversation.tenantId = ''
        const transaction = jest.spyOn(f.db, 'transaction')
        await expect(f.views.read(f.threadId)).rejects.toMatchObject({ status: 403 })
        expect(transaction).not.toHaveBeenCalled()
        expect(await f.db.getRepository(ThreadControlProjection).count()).toBe(1)
    })
})
