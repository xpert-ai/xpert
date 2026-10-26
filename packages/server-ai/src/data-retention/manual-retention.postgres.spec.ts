import { randomUUID } from 'node:crypto'
import { createCache } from 'cache-manager'
import { DataSource, EntitySchema, QueryRunner } from 'typeorm'
import { RequestContext, setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { ManualRetentionRange } from '@xpert-ai/contracts'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ManualRetentionService } from './manual-retention.service'
import { manualRetentionPreviewSql } from './manual-retention.sql'

interface ExplainPlan {
    'Node Type': string
    'Relation Name'?: string
    'CTE Name'?: string
    'Subplan Name'?: string
    'Actual Rows': number
    'Actual Loops': number
    Plans?: ExplainPlan[]
}

function planNodes(plan: ExplainPlan): ExplainPlan[] {
    return [plan, ...(plan.Plans ?? []).flatMap(planNodes)]
}

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
            CREATE TEMP TABLE xpert_agent_execution ("tenantId" uuid, "organizationId" uuid, "threadId" text,
                status text, metadata jsonb);
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
            `TRUNCATE pg_temp.copilot_checkpoint, pg_temp.copilot_checkpoint_writes, pg_temp.chat_message,
                pg_temp.chat_conversation_thread, pg_temp.xpert_agent_execution,
                pg_temp.model_gateway_call, pg_temp.membership_point_ledger`
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
        const expected: Array<{ id: string }> = await runner.query(
            'SELECT id FROM copilot_checkpoint ORDER BY "createdAt", id LIMIT 1000'
        )
        expect(await cache.get(`manual-retention-preview:${preview.previewToken}`)).toMatchObject({
            ids: expected.map(({ id }) => id)
        })
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

    it.each(['copilot_checkpoint', 'model_gateway_call'] as const)(
        'returns an empty batch for %s without matches',
        async (target) => {
            const preview = await service.preview({ ...checkpointRange, target })
            expect(preview).toMatchObject({
                matchedCount: 0,
                eligibleCount: 0,
                protectedCount: 0,
                selectedCount: 0,
                relatedWriteCount: 0
            })
            expect(await cache.get(`manual-retention-preview:${preview.previewToken}`)).toMatchObject({ ids: [] })
        }
    )

    it.each([
        { name: 'pending', status: 'pending', protected: true },
        { name: 'running', status: 'running', protected: true },
        { name: 'interrupted', status: 'interrupted', protected: true },
        { name: 'error', status: 'error', protected: true },
        { name: 'success', status: 'success', protected: false },
        { name: 'missing recovery', missing: true, protected: false },
        { name: 'unknown recovery version', version: 2, protected: false },
        { name: 'string recovery version', version: '1', protected: true },
        { name: 'different execution thread', mismatch: 'executionThread', protected: false },
        { name: 'different input thread', mismatch: 'threadId', protected: false },
        { name: 'different namespace', mismatch: 'checkpointNs', protected: false },
        { name: 'different checkpoint', mismatch: 'checkpointId', protected: false },
        { name: 'different tenant', mismatch: 'tenant', protected: false },
        { name: 'different organization', mismatch: 'organization', protected: false },
        { name: 'both scopes null', nullScopes: true, protected: true },
        { name: 'null tenant does not match a tenant', mismatch: 'nullTenant', protected: false },
        { name: 'null organization does not match an organization', mismatch: 'nullOrganization', protected: false }
    ])('preserves recovery protection semantics: $name', async (testCase) => {
        const id = await checkpoint()
        if (testCase.nullScopes) {
            await runner.query(
                'UPDATE copilot_checkpoint SET "tenantId" = NULL, "organizationId" = NULL WHERE id = $1',
                [id]
            )
        }
        const tenant =
            testCase.nullScopes || testCase.mismatch === 'nullTenant'
                ? null
                : testCase.mismatch === 'tenant'
                  ? randomUUID()
                  : tenantId
        const organization =
            testCase.nullScopes || testCase.mismatch === 'nullOrganization'
                ? null
                : testCase.mismatch === 'organization'
                  ? randomUUID()
                  : organizationId
        const input = {
            threadId: testCase.mismatch === 'threadId' ? 'different' : id,
            checkpointNs: testCase.mismatch === 'checkpointNs' ? 'different' : '',
            checkpointId: testCase.mismatch === 'checkpointId' ? 'different' : id
        }
        const metadata = testCase.missing ? {} : { recovery: { version: testCase.version ?? 1, input } }
        // Duplicate references must not inflate matched/protected counts.
        await runner.query('INSERT INTO xpert_agent_execution VALUES ($1, $2, $3, $4, $5), ($1, $2, $3, $4, $5)', [
            tenant,
            organization,
            testCase.mismatch === 'executionThread' ? 'different' : id,
            testCase.status ?? 'error',
            metadata
        ])
        const preview = await service.preview(checkpointRange)
        expect(preview).toMatchObject({
            matchedCount: 1,
            protectedCount: testCase.protected ? 1 : 0,
            eligibleCount: testCase.protected ? 0 : 1,
            selectedCount: testCase.protected ? 0 : 1
        })
        expect(await service.execute({ previewToken: preview.previewToken, confirmed: true })).toMatchObject({
            deletedCount: testCase.protected ? 0 : 1
        })
    })

    it.each(['recovery', 'input', 'runControl'] as const)(
        'rechecks new %s protection before execution',
        async (kind) => {
            const id = await checkpoint()
            const preview = await service.preview(checkpointRange)
            const reference = { threadId: id, checkpointNs: '', checkpointId: id }
            if (kind === 'recovery') {
                await runner.query('INSERT INTO xpert_agent_execution VALUES ($1, $2, $3, $4, $5)', [
                    tenantId,
                    organizationId,
                    id,
                    'interrupted',
                    { recovery: { version: 1, input: reference } }
                ])
            } else if (kind === 'input') {
                await runner.query('INSERT INTO chat_message VALUES ($1, $2, NULL, $3, $4, NULL)', [
                    tenantId,
                    organizationId,
                    id,
                    { checkpoint: reference }
                ])
            } else {
                await runner.query(`INSERT INTO chat_conversation_thread VALUES ($1, '{}')`, [id])
            }
            expect(await service.execute({ previewToken: preview.previewToken, confirmed: true })).toEqual({
                deletedCount: 0,
                deletedWriteCount: 0,
                skippedCount: 1
            })
            expect(await runner.query('SELECT id FROM copilot_checkpoint')).toEqual([{ id }])
            expect((await runner.query('SELECT * FROM copilot_checkpoint_writes')).length).toBe(1)
        }
    )

    it.each([false, true])(
        'retains ancestors referenced outside the time range, including cycles (null scopes: %s)',
        async (nullScopes) => {
            const parent = await checkpoint()
            const child = await checkpoint('2020-02-02')
            await runner.query('UPDATE copilot_checkpoint SET thread_id = $1, parent_id = $1 WHERE id = $2', [
                parent,
                child
            ])
            await runner.query('UPDATE copilot_checkpoint SET parent_id = $1 WHERE id = $2', [child, parent])
            const foreign = await checkpoint()
            // The same thread/checkpoint coordinates in another scope must stay eligible.
            await runner.query(
                'UPDATE copilot_checkpoint SET thread_id = $1, checkpoint_id = $1, "tenantId" = $2 WHERE id = $3',
                [parent, randomUUID(), foreign]
            )
            if (nullScopes) {
                await runner.query(
                    'UPDATE copilot_checkpoint SET "tenantId" = NULL, "organizationId" = NULL WHERE id = ANY($1::uuid[])',
                    [[parent, child]]
                )
            }
            await runner.query('INSERT INTO chat_message VALUES ($1, $2, NULL, $3, NULL, $4)', [
                nullScopes ? null : tenantId,
                nullScopes ? null : organizationId,
                parent,
                { checkpoints: [{ threadId: parent, checkpointNs: '', checkpointId: child }] }
            ])
            const preview = await service.preview(checkpointRange)
            expect(preview).toMatchObject({ matchedCount: 2, protectedCount: 1, selectedCount: 1 })
            expect(await service.execute({ previewToken: preview.previewToken, confirmed: true })).toMatchObject({
                deletedCount: 1
            })
            const remaining: Array<{ id: string }> = await runner.query('SELECT id FROM copilot_checkpoint')
            expect(remaining.map(({ id }) => id).sort()).toEqual([parent, child].sort())
        }
    )

    it('ignores deleted references and mismatched input coordinates, preserving the existing unscoped input rule', async () => {
        const deleted = await checkpoint()
        const mismatched = await checkpoint()
        const input = await checkpoint()
        for (const id of [deleted, mismatched, input]) {
            await runner.query('INSERT INTO chat_message VALUES ($1, $2, $3, $4, $5, $6)', [
                randomUUID(),
                randomUUID(),
                id === deleted ? '2020-01-15' : null,
                id,
                { checkpoint: { threadId: id, checkpointNs: id === mismatched ? 'other' : '', checkpointId: id } },
                null
            ])
        }
        await runner.query('INSERT INTO chat_message VALUES ($1, $2, $3, $4, NULL, $5)', [
            tenantId,
            organizationId,
            '2020-01-15',
            deleted,
            { checkpoints: [{ threadId: deleted, checkpointNs: '', checkpointId: deleted }] }
        ])
        const preview = await service.preview(checkpointRange)
        expect(preview).toMatchObject({ matchedCount: 3, protectedCount: 1, selectedCount: 2 })
        await service.execute({ previewToken: preview.previewToken, confirmed: true })
        expect(await runner.query('SELECT id FROM copilot_checkpoint')).toEqual([{ id: input }])
    })

    it('previews 100,000 checkpoints without rescanning protection sets per candidate', async () => {
        // Production-like cardinalities and existing indexes, deliberately no execution thread index.
        // 76 chains of 1,000 ancestors expose the old correlated CTE scan even with warm buffers.
        await runner.query(`
            CREATE INDEX IF NOT EXISTS retention_test_checkpoint_key ON copilot_checkpoint (thread_id, checkpoint_ns, checkpoint_id);
            CREATE INDEX IF NOT EXISTS retention_test_write_key ON copilot_checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id);
            CREATE INDEX IF NOT EXISTS retention_test_message_thread ON chat_message ("createdInThreadId");
            CREATE INDEX IF NOT EXISTS retention_test_thread ON chat_conversation_thread ("threadId");
        `)
        await runner.query(
            `
            INSERT INTO copilot_checkpoint
            SELECT gen_random_uuid(), $1, $2, '2020-01-10', 'thread-' || ((i - 1) / 1000), '', i::text,
                CASE WHEN (i - 1) % 1000 = 0 THEN NULL ELSE (i - 1)::text END
            FROM generate_series(1, 100000) i;
        `,
            [tenantId, organizationId]
        )
        await runner.query(
            `
            INSERT INTO chat_message
            SELECT $1, $2, NULL, 'thread-' || (i - 1), NULL,
                jsonb_build_object('checkpoints', jsonb_build_array(jsonb_build_object(
                    'threadId', 'thread-' || (i - 1), 'checkpointNs', '', 'checkpointId', (i * 1000)::text)))
            FROM generate_series(1, 76) i;
        `,
            [tenantId, organizationId]
        )
        await runner.query(
            `
            INSERT INTO xpert_agent_execution
            SELECT $1, $2, 'unrelated-' || i, 'error', '{}'::jsonb FROM generate_series(1, 20000) i;
        `,
            [tenantId, organizationId]
        )
        await runner.query(
            `
            INSERT INTO xpert_agent_execution
            SELECT $1, $2, 'thread-80', 'interrupted', jsonb_build_object('recovery', jsonb_build_object(
                'version', 1, 'input', jsonb_build_object('threadId', 'thread-80', 'checkpointNs', '', 'checkpointId', i::text)))
            FROM generate_series(80001, 80016) i;
        `,
            [tenantId, organizationId]
        )
        await runner.query(`
            INSERT INTO chat_conversation_thread VALUES ('thread-90', '{}');
            INSERT INTO copilot_checkpoint_writes
            SELECT "tenantId", "organizationId", thread_id, checkpoint_ns, checkpoint_id
            FROM copilot_checkpoint CROSS JOIN generate_series(1, 2);
            ANALYZE copilot_checkpoint;
            ANALYZE copilot_checkpoint_writes;
            ANALYZE chat_message;
            ANALYZE chat_conversation_thread;
            ANALYZE xpert_agent_execution;
        `)
        const started = performance.now()
        const preview = await service.preview(checkpointRange)
        const elapsedMs = performance.now() - started
        expect(preview).toMatchObject({
            matchedCount: 100000,
            protectedCount: 77016,
            eligibleCount: 22984,
            selectedCount: 1000,
            relatedWriteCount: 2000
        })
        const expected: Array<{ id: string }> = await runner.query(`
            SELECT id FROM copilot_checkpoint
            WHERE checkpoint_id::int > 76000 AND checkpoint_id::int NOT BETWEEN 80001 AND 80016
                AND thread_id <> 'thread-90'
            ORDER BY "createdAt", id LIMIT 1000
        `)
        expect(await cache.get(`manual-retention-preview:${preview.previewToken}`)).toMatchObject({
            ids: expected.map(({ id }) => id)
        })
        // Assert actual work, not a brittle wall-clock threshold. Bound EXPLAIN independently.
        const plans: Array<{ 'QUERY PLAN': Array<{ Plan: ExplainPlan; 'Execution Time': number }> }> =
            await runner.manager.transaction(async (manager) => {
                await manager.query("SET LOCAL statement_timeout = '30s'")
                return manager.query(
                    `EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${manualRetentionPreviewSql(checkpointRange)}`,
                    [checkpointRange.start, checkpointRange.end, 1000]
                )
            })
        const nodes = planNodes(plans[0]['QUERY PLAN'][0].Plan)
        const executionScans = nodes.filter((node) => node['Relation Name'] === 'xpert_agent_execution')
        expect(executionScans.length).toBeGreaterThan(0)
        expect(executionScans.every((node) => node['Actual Loops'] === 1)).toBe(true)
        const branchScans = nodes.filter(
            (node) => node['Node Type'] === 'CTE Scan' && node['CTE Name'] === 'branch_checkpoints'
        )
        expect(branchScans.length).toBeGreaterThan(0)
        expect(branchScans.every((node) => node['Actual Loops'] === 1)).toBe(true)
        expect(nodes.filter((node) => node['Subplan Name'] === 'CTE matching')).toEqual([
            expect.objectContaining({ 'Actual Rows': 100000, 'Actual Loops': 1 })
        ])
        console.info(
            `Retention benchmark: checkpoints=100000, protected=77016, executions=20016, previewMs=${Math.round(elapsedMs)}`
        )
    }, 90000)
})
