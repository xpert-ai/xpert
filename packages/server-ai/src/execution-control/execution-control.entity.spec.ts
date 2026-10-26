import { IExecutionControl } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { ExecutionControl } from './execution-control.entity'
import { executionControlTestEntities, seedExecutionControlScope } from './testing/scope.fixture'

class MetadataDataSource extends DataSource {
    buildEntityMetadata() {
        return this.buildMetadatas()
    }
}

describe('ExecutionControl base entity contract', () => {
    it('inherits one generated primary key, audit and scope relations, keeping execution identity unique', async () => {
        const database = new MetadataDataSource({ type: 'postgres', entities: executionControlTestEntities })
        await database.buildEntityMetadata()
        const metadata = database.getMetadata(ExecutionControl)
        const contract: IExecutionControl = new ExecutionControl({ tenantId: randomUUID() })
        expect(contract).toBeInstanceOf(TenantOrganizationBaseEntity)
        expect(contract.tenantId).toBeDefined()
        expect(metadata.primaryColumns.map((column) => column.propertyName)).toEqual(['id'])
        expect(metadata.primaryColumns[0].generationStrategy).toBe('uuid')
        expect(
            metadata.indices.some((index) => index.isUnique && index.columns[0].propertyName === 'executionId')
        ).toBe(true)
        expect(metadata.createDateColumn.propertyName).toBe('createdAt')
        expect(metadata.updateDateColumn.propertyName).toBe('updatedAt')
        expect(metadata.relations.map((relation) => relation.propertyName).sort()).toEqual([
            'createdBy',
            'organization',
            'tenant',
            'updatedBy'
        ])
    })
})

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const migration = readFileSync(join(__dirname, 'migration.sql'), 'utf8')
const legacy = `CREATE TABLE execution_control (
    "executionId" uuid PRIMARY KEY, "tenantId" uuid NOT NULL, "organizationId" uuid,
    "threadId" varchar NOT NULL, "rootExecutionId" uuid NOT NULL,
    ownership jsonb NOT NULL, ancestors jsonb NOT NULL,
    desired varchar NOT NULL DEFAULT 'running', revision integer NOT NULL DEFAULT 1,
    "graphEnded" boolean NOT NULL DEFAULT false, work jsonb NOT NULL DEFAULT '[]'::jsonb
)`

integration.each(['fresh', 'legacy'] as const)('ExecutionControl %s SQL / PostgreSQL', (mode) => {
    const schema = `control_base_${randomUUID().replace(/-/g, '')}`
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const executionId = randomUUID()
    let database: DataSource
    const facts = {
        ...scope,
        executionId,
        threadId: randomUUID(),
        rootExecutionId: executionId,
        ownership: { policy: 'attached' as const, rootExecutionId: executionId },
        ancestors: [executionId],
        desired: 'terminated' as const,
        revision: 3,
        graphEnded: true,
        work: [{ id: 'unfinished-tool', executionId, settled: false }]
    }
    beforeAll(async () => {
        if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        database = new DataSource({
            type: 'postgres',
            url,
            schema,
            uuidExtension: 'pgcrypto',
            extra: { options: `-c search_path=${schema},public` },
            entities: executionControlTestEntities
        })
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        for (const name of ['user', 'tenant', 'organization'])
            await database.query(`CREATE TABLE "${name}" (id uuid PRIMARY KEY)`)
        await seedExecutionControlScope(database, scope)
        if (mode === 'legacy') {
            await database.query(legacy)
            await database.query(
                `INSERT INTO execution_control
                ("executionId", "tenantId", "organizationId", "threadId", "rootExecutionId", ownership, ancestors, desired, revision, "graphEnded", work)
                VALUES ($1, $2, $3, $4, $1, $5, $6, $7, $8, $9, $10)`,
                [
                    executionId,
                    scope.tenantId,
                    scope.organizationId,
                    facts.threadId,
                    JSON.stringify(facts.ownership),
                    JSON.stringify(facts.ancestors),
                    facts.desired,
                    facts.revision,
                    facts.graphEnded,
                    JSON.stringify(facts.work)
                ]
            )
        }
        await database.query(migration)
        await database.query(migration)
    })
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await database.destroy()
        }
    })
    it('matches inherited columns and relations without a second primary key', async () => {
        const runner = database.createQueryRunner()
        try {
            const table = await runner.getTable(`${schema}.execution_control`)
            const metadata = database.getMetadata(ExecutionControl)
            expect(table.columns.map((column) => column.name).sort()).toEqual(
                metadata.columns.map((column) => column.databaseName).sort()
            )
            expect(table.primaryColumns.map((column) => column.name)).toEqual(['id'])
            expect(table.foreignKeys.map((key) => key.columnNames[0]).sort()).toEqual([
                'createdById',
                'organizationId',
                'tenantId',
                'updatedById'
            ])
            for (const column of metadata.columns) {
                const actual = table.columns.find((candidate) => candidate.name === column.databaseName)
                expect(actual.isNullable).toBe(column.isNullable)
                expect(actual.type).toBe(database.driver.normalizeType(column))
            }
        } finally {
            await runner.release()
        }
    })
    it('persists inherited identity/audit fields and preserves tombstones on duplicate execution admission', async () => {
        const repository = database.getRepository(ExecutionControl)
        if (mode === 'fresh') await repository.save(new ExecutionControl(facts))
        const before = await repository.findOneByOrFail({ executionId })
        expect(before).toMatchObject(facts)
        expect(before.id).toEqual(expect.any(String))
        expect(before.createdAt).toBeInstanceOf(Date)
        expect(before.updatedAt).toBeInstanceOf(Date)
        expect(before.createdById).toBeNull()
        await repository
            .createQueryBuilder()
            .insert()
            .values({ ...facts, desired: 'running' })
            .orIgnore()
            .execute()
        expect(await repository.countBy({ executionId })).toBe(1)
        expect(await repository.findOneByOrFail({ executionId })).toMatchObject({ ...facts, id: before.id })
        const actor = randomUUID()
        await database.manager.insert('User', { id: actor })
        before.updatedById = actor
        before.work[0].settled = true
        await repository.save(before)
        const saved = await repository.findOneOrFail({
            where: { executionId },
            relations: { tenant: true, organization: true, updatedBy: true }
        })
        expect(saved.id).toBe(before.id)
        expect(saved.createdAt).toEqual(before.createdAt)
        expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(before.createdAt.getTime())
        expect(saved.tenant.id).toBe(scope.tenantId)
        expect(saved.organization.id).toBe(scope.organizationId)
        expect(saved.updatedBy.id).toBe(actor)
        expect(saved.desired).toBe('terminated')
        expect(saved.work[0].settled).toBe(true)
        await expect(repository.insert({ ...facts, id: randomUUID() })).rejects.toMatchObject({ code: '23505' })
    })
})
