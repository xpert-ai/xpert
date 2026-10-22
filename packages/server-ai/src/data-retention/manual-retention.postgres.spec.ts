import { randomUUID } from 'node:crypto'
import { createCache } from 'cache-manager'
import { DataSource, EntitySchema, QueryRunner } from 'typeorm'
import { RequestContext, setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { ManualRetentionRange } from '@xpert-ai/contracts'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ManualRetentionService } from './manual-retention.service'

const postgres = process.env.RETENTION_TEST_DATABASE_URL ? describe : describe.skip
postgres('manual retention on PostgreSQL', () => {
    const tenantId = randomUUID()
    const actorId = randomUUID()
    const organizationId = randomUUID()
    const checkpointRange: ManualRetentionRange = {
        target: 'copilot_checkpoint',
        start: '2020-01-01T00:00:00Z',
        end: '2020-02-01T00:00:00Z'
    }
    const database = new DataSource({
        type: 'postgres',
        url: process.env.RETENTION_TEST_DATABASE_URL,
        entities: [
            new EntitySchema({
                name: 'MembershipPointLedger',
                target: MembershipPointLedger,
                tableName: 'membership_point_ledger',
                columns: {
                    id: { type: 'uuid', primary: true },
                    tenantId: { type: 'uuid' },
                    source: { type: 'varchar' },
                    requestId: { type: 'varchar' },
                    gatewayRequestId: { type: 'varchar' },
                    pointsDelta: { type: 'numeric' },
                    totalTokens: { type: 'bigint' },
                    priceAmount: { type: 'numeric', nullable: true }
                }
            }),
            new EntitySchema({
                name: 'ModelGatewayCall',
                target: ModelGatewayCall,
                tableName: 'model_gateway_call',
                columns: { id: { type: 'uuid', primary: true } }
            })
        ]
    })
    const cache = createCache()
    let runner: QueryRunner
    let service: ManualRetentionService
    beforeAll(async () => {
        await database.initialize()
        runner = database.createQueryRunner()
        await runner.connect()
        await runner.query(`
            CREATE TEMP TABLE copilot_checkpoint (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid,
                "createdAt" timestamptz, thread_id text, checkpoint_ns text, checkpoint_id text, parent_id text);
            CREATE TEMP TABLE copilot_checkpoint_writes ("tenantId" uuid, "organizationId" uuid, thread_id text, checkpoint_ns text, checkpoint_id text);
            CREATE TEMP TABLE chat_message ("tenantId" uuid, "organizationId" uuid, "deletedAt" timestamptz,
                "createdInThreadId" text, "inputCheckpoint" jsonb, "outputCheckpoint" jsonb);
            CREATE TEMP TABLE chat_conversation_thread ("threadId" text, "runControl" jsonb);
            CREATE TEMP TABLE model_gateway_call (id uuid PRIMARY KEY, "tenantId" uuid, "requestId" uuid, status text,
                "createdAt" timestamptz, "completedAt" timestamptz, "totalTokens" bigint, "priceAmount" numeric);
            CREATE TEMP TABLE membership_point_ledger (id uuid PRIMARY KEY, "tenantId" uuid, source text,
                "requestId" text, "gatewayRequestId" text, "pointsDelta" numeric, "totalTokens" bigint CHECK ("totalTokens" >= 0), "priceAmount" numeric);
        `)
        const dataSource = { transaction: runner.manager.transaction.bind(runner.manager) } as DataSource
        service = new ManualRetentionService(dataSource, cache)
    })
    beforeEach(async () => {
        setDefaultTenantId(tenantId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actorId)
        jest.spyOn(RequestContext, 'hasRole').mockReturnValue(true)
        await cache.clear()
        await runner.query(
            'TRUNCATE copilot_checkpoint, copilot_checkpoint_writes, chat_message, chat_conversation_thread, model_gateway_call, membership_point_ledger'
        )
    })
    afterEach(() => {
        jest.restoreAllMocks()
        setDefaultTenantId(null)
    })
    afterAll(async () => {
        await runner?.release()
        if (database.isInitialized) await database.destroy()
    })

    async function checkpoint(date = '2020-01-10', tenant = tenantId) {
        const id = randomUUID()
        await runner.query(
            `INSERT INTO copilot_checkpoint VALUES ($1::uuid, $2, $3, $4, $1::text, '', $1::text, NULL)`,
            [id, tenant, organizationId, date]
        )
        await runner.query(`INSERT INTO copilot_checkpoint_writes VALUES ($1, $2, $3, '', $3)`, [
            tenant,
            organizationId,
            id
        ])
        return id
    }
    async function protect(id: string) {
        await runner.query(`INSERT INTO chat_message VALUES ($1, $2, NULL, $3, NULL, $4::jsonb)`, [
            tenantId,
            organizationId,
            id,
            JSON.stringify({ checkpoints: [{ threadId: id, checkpointNs: '', checkpointId: id }] })
        ])
    }
    async function call(status = 'succeeded', tokens = 20) {
        const id = randomUUID()
        await runner.query(
            `INSERT INTO model_gateway_call VALUES ($1, $2, $3, $4, '2020-01-10', '2020-01-11', $5, NULL)`,
            [id, tenantId, randomUUID(), status, tokens]
        )
        return id
    }
    it('previews all tenants, excludes protected records, uses inclusive start/exclusive end and deletes related writes', async () => {
        await checkpoint('2020-01-01', randomUUID())
        const protectedId = await checkpoint()
        await protect(protectedId)
        await checkpoint('2020-02-01')
        const preview = await service.preview(checkpointRange)
        expect(preview).toMatchObject({
            scope: 'all_tenants',
            matchedCount: 2,
            protectedCount: 1,
            selectedCount: 1,
            relatedWriteCount: 1
        })
        expect(await service.execute({ previewToken: preview.previewToken, confirmed: true })).toEqual({
            deletedCount: 1,
            deletedWriteCount: 1,
            skippedCount: 0
        })
        expect((await runner.query('SELECT * FROM copilot_checkpoint')).length).toBe(2)
        await expect(service.execute({ previewToken: preview.previewToken, confirmed: true })).rejects.toThrow()
    })
    it('does not include new rows and rechecks newly protected records', async () => {
        const id = await checkpoint()
        const preview = await service.preview(checkpointRange)
        await protect(id)
        await checkpoint()
        expect(await service.execute({ previewToken: preview.previewToken, confirmed: true })).toEqual({
            deletedCount: 0,
            deletedWriteCount: 0,
            skippedCount: 1
        })
        expect((await runner.query('SELECT * FROM copilot_checkpoint')).length).toBe(2)
    })
    it('preserves branch ancestors and active threads', async () => {
        const parent = await checkpoint()
        const child = await checkpoint()
        await runner.query('UPDATE copilot_checkpoint SET thread_id = $1, parent_id = $1 WHERE id = $2', [
            parent,
            child
        ])
        await runner.query(`INSERT INTO chat_message VALUES ($1, $2, NULL, $3, NULL, $4::jsonb)`, [
            tenantId,
            organizationId,
            parent,
            JSON.stringify({ checkpoints: [{ threadId: parent, checkpointNs: '', checkpointId: child }] })
        ])
        const active = await checkpoint()
        await runner.query(`INSERT INTO chat_conversation_thread VALUES ($1, '{}')`, [active])
        expect(await service.preview(checkpointRange)).toMatchObject({
            matchedCount: 3,
            protectedCount: 3,
            selectedCount: 0
        })
    })
    it('rejects other tenants, non-super-admins, other actors and expired receipts', async () => {
        await checkpoint()
        const preview = await service.preview(checkpointRange)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(randomUUID())
        await expect(service.preview(checkpointRange)).rejects.toThrow()
        await expect(service.execute({ previewToken: preview.previewToken, confirmed: true })).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        jest.spyOn(RequestContext, 'hasRole').mockReturnValue(false)
        await expect(service.preview(checkpointRange)).rejects.toThrow()
        jest.spyOn(RequestContext, 'hasRole').mockReturnValue(true)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(randomUUID())
        await expect(service.execute({ previewToken: preview.previewToken, confirmed: true })).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actorId)
        jest.spyOn(Date, 'now').mockReturnValue(Date.parse(preview.expiresAt) + 1)
        await expect(service.execute({ previewToken: preview.previewToken, confirmed: true })).rejects.toThrow()
        expect((await runner.query('SELECT * FROM copilot_checkpoint')).length).toBe(1)
    })
    it('limits the approved batch to 1000 records', async () => {
        await runner.query(
            `INSERT INTO copilot_checkpoint SELECT gen_random_uuid(), $1, $2, '2020-01-10', i::text, '', i::text, NULL FROM generate_series(1, 1001) i`,
            [tenantId, organizationId]
        )
        const preview = await service.preview(checkpointRange)
        expect(preview).toMatchObject({ matchedCount: 1001, eligibleCount: 1001, selectedCount: 1000 })
        expect(await service.execute({ previewToken: preview.previewToken, confirmed: true })).toMatchObject({
            deletedCount: 1000
        })
    })
    it('retains usage facts atomically and excludes started or pending settlement calls', async () => {
        await call()
        await call('failed', 0)
        await call('started')
        await call('settlement_pending')
        const preview = await service.preview({ ...checkpointRange, target: 'model_gateway_call' })
        expect(preview).toMatchObject({ matchedCount: 4, protectedCount: 2, selectedCount: 2, relatedWriteCount: 0 })
        expect(await service.execute({ previewToken: preview.previewToken, confirmed: true })).toMatchObject({
            deletedCount: 2
        })
        expect(await runner.query('SELECT "totalTokens", "pointsDelta" FROM membership_point_ledger')).toEqual([
            { totalTokens: '20', pointsDelta: '0' }
        ])
        expect((await runner.query('SELECT * FROM model_gateway_call')).length).toBe(2)
    })
    it('rolls back deletion when retaining usage fails', async () => {
        await call('succeeded', -1)
        await runner.query('UPDATE model_gateway_call SET "priceAmount" = 1')
        const preview = await service.preview({ ...checkpointRange, target: 'model_gateway_call' })
        await expect(service.execute({ previewToken: preview.previewToken, confirmed: true })).rejects.toThrow()
        expect((await runner.query('SELECT * FROM model_gateway_call')).length).toBe(1)
        expect((await runner.query('SELECT * FROM membership_point_ledger')).length).toBe(0)
    })
})
