import type { IMcpRemoteOperation, McpOperationRecord } from '@xpert-ai/contracts'
import { TaskControlStore, TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { mcpTestDatabase, mcpTestEntities } from '../../mcp-publication/testing/database'
import { principal, publication } from '../../mcp-publication/testing/fixtures'
import { McpRemoteOperation } from './mcp-operation.entity'
import { McpOperationStore } from './mcp-operation.store'
import { readMcpOperation } from './mcp-operation.schema'

class MetadataDataSource extends DataSource {
    buildEntityMetadata() {
        return this.buildMetadatas()
    }
}
it('inherits one UUID primary key, audit fields and tenant/organization relations', async () => {
    const db = new MetadataDataSource({ type: 'postgres', entities: [...mcpTestEntities, McpRemoteOperation] })
    await db.buildEntityMetadata()
    const entity: IMcpRemoteOperation = new McpRemoteOperation()
    expect(entity).toBeInstanceOf(TenantOrganizationBaseEntity)
    const metadata = db.getMetadata(McpRemoteOperation)
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
})

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const migration = readFileSync(join(__dirname, 'migrations/20261024-mcp-execution-control.sql'), 'utf8')
const legacy = `CREATE TABLE mcp_remote_operation (
    id uuid PRIMARY KEY, "tenantId" uuid NOT NULL, "organizationId" uuid,
    "operationKey" varchar NOT NULL, "targetId" uuid NOT NULL, generation uuid NOT NULL,
    record jsonb NOT NULL, "nextControlAt" timestamptz,
    CONSTRAINT mcp_remote_operation_scope_key UNIQUE ("tenantId", "operationKey")
)`
integration.each(['fresh', 'legacy'] as const)('MCP operation %s schema / PostgreSQL', (mode) => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>
    const id = randomUUID(),
        generation = randomUUID(),
        targetId = randomUUID(),
        key = 'saved-operation'
    const scope = { tenantId: publication().tenantId, organizationId: publication().organizationId }
    const record: McpOperationRecord = {
        version: 1,
        scope: {
            actor: { ...scope, userId: principal().userId },
            workspaceId: randomUUID(),
            toolsetId: randomUUID(),
            serverName: 'original'
        },
        connectionVersion: 'a'.repeat(64),
        reconnectable: true,
        identity: { version: 1, operationId: id, generation, inputHash: 'b'.repeat(64), toolName: 'write-once' },
        serverId: publication().id,
        mode: 'task',
        phase: 'unknown',
        hostId: randomUUID(),
        claim: randomUUID(),
        taskId: randomUUID(),
        hostExited: false,
        inputResponses: { saved: { action: 'accept' } },
        failureCount: 2,
        receipt: {
            version: 1,
            serverId: publication().id,
            operationId: id,
            generation,
            taskId: null,
            state: 'pending',
            intent: 'terminated',
            revision: 3,
            handlerExited: false,
            descendantsSettled: false
        }
    }
    beforeAll(async () => {
        database = await mcpTestDatabase(url, [McpRemoteOperation])
        const db = database.db
        await db.query('DROP TABLE mcp_remote_operation')
        if (mode === 'legacy') {
            await db.query(legacy)
            await db.query(
                `INSERT INTO mcp_remote_operation (id,"tenantId","organizationId","operationKey","targetId",generation,record)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [id, scope.tenantId, scope.organizationId, key, targetId, generation, JSON.stringify(record)]
            )
        }
        await db.query(migration)
        await db.query(migration)
        if (mode === 'fresh')
            await db.getRepository(McpRemoteOperation).save({
                id,
                ...scope,
                operationKey: key,
                targetId,
                generation,
                record,
                nextControlAt: null
            })
    })
    afterAll(async () => {
        if (database) await database.close()
    })

    it('keeps migration columns, nullability, indexes and relation actions aligned with the inherited entity', async () => {
        const db = database.db,
            runner = db.createQueryRunner()
        try {
            const metadata = db.getMetadata(McpRemoteOperation)
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
            }
            expect(table.foreignKeys.map((key) => [key.columnNames[0], key.onDelete, key.onUpdate]).sort()).toEqual([
                ['createdById', 'RESTRICT', 'NO ACTION'],
                ['organizationId', 'CASCADE', 'CASCADE'],
                ['tenantId', 'CASCADE', 'NO ACTION'],
                ['updatedById', 'RESTRICT', 'NO ACTION']
            ])
            expect(table.indices.map((index) => index.columnNames)).toEqual(
                expect.arrayContaining([['tenantId'], ['organizationId'], ['nextControlAt']])
            )
        } finally {
            await runner.release()
        }
    })
    it('preserves the original id, generation, input response and pending termination receipt across repeated migration', async () => {
        const db = database.db,
            repository = db.getRepository(McpRemoteOperation)
        const before = readMcpOperation(await repository.findOneByOrFail({ id }))
        expect(before).toMatchObject({ id, ...scope, operationKey: key, targetId, generation, record })
        expect(before.record).toEqual(record)
        expect(before.createdAt).toBeInstanceOf(Date)
        expect(before.updatedAt).toBeInstanceOf(Date)
        expect(before.createdById).toBeNull()
        expect(before.updatedById).toBeNull()
        await db.query(migration)
        expect(await repository.findOneByOrFail({ id })).toEqual(before)
        await expect(repository.insert({ ...before, id: randomUUID() })).rejects.toMatchObject({ code: '23505' })
        expect(await repository.count()).toBe(1)
    })
    it('loads inherited audit and scope relations while preserving the durable record', async () => {
        const repository = database.db.getRepository(McpRemoteOperation)
        await repository.save({ id, createdById: principal().userId, updatedById: principal().userId })
        expect(
            await repository.findOneOrFail({
                where: { id },
                relations: { createdBy: true, updatedBy: true, tenant: true, organization: true }
            })
        ).toMatchObject({
            id,
            record,
            tenant: { id: scope.tenantId },
            organization: { id: scope.organizationId },
            createdBy: { id: principal().userId },
            updatedBy: { id: principal().userId }
        })
        await expect(repository.update(id, { tenantId: randomUUID() })).rejects.toMatchObject({ code: '23503' })
    })
    it('rejects a missing tenant before attempting durable registration', async () => {
        const db = database.db,
            store = new McpOperationStore(db.getRepository(McpRemoteOperation), new TaskControlStore(db))
        await expect(
            store.reserve('invalid-scope', {
                ...record,
                scope: { ...record.scope, actor: { ...record.scope.actor, tenantId: '' } }
            })
        ).rejects.toMatchObject({ reason: 'scope' })
        expect(await db.getRepository(McpRemoteOperation).count()).toBe(1)
    })
})
