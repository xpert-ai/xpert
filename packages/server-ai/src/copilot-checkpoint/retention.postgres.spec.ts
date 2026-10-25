import { randomUUID } from 'node:crypto'
import { DataSource, QueryRunner, Repository } from 'typeorm'
import {
    COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
    COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING
} from '@xpert-ai/contracts'
import { setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointRetentionService } from './retention.service'

const connectionString = process.env.RETENTION_TEST_DATABASE_URL
const postgres = connectionString ? describe : describe.skip

postgres('default tenant checkpoint retention (PostgreSQL)', () => {
    const defaultTenantId = randomUUID()
    const otherTenantId = randomUUID()
    const organizationId = randomUUID()
    const database = new DataSource({ type: 'postgres', url: connectionString })
    let runner: QueryRunner
    let service: CopilotCheckpointRetentionService

    beforeAll(async () => {
        await database.initialize()
        runner = database.createQueryRunner()
        await runner.connect()
        // Connection-local fixtures shadow production table names; no persisted application data is touched.
        await runner.query(`
            CREATE TEMP TABLE tenant_setting ("tenantId" uuid, name text, value text);
            CREATE TEMP TABLE copilot_checkpoint (
                id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "createdAt" timestamptz,
                thread_id text, checkpoint_ns text, checkpoint_id text, parent_id text
            );
            CREATE TEMP TABLE copilot_checkpoint_writes (
                "tenantId" uuid, "organizationId" uuid, thread_id text, checkpoint_ns text, checkpoint_id text
            );
            CREATE TEMP TABLE chat_message (
                "tenantId" uuid, "organizationId" uuid, "deletedAt" timestamptz,
                "createdInThreadId" text, "inputCheckpoint" jsonb, "outputCheckpoint" jsonb
            );
            CREATE TEMP TABLE xpert_agent_execution ("tenantId" uuid, "organizationId" uuid, "threadId" text, status text, metadata jsonb);
            CREATE TEMP TABLE chat_conversation_thread ("threadId" text, "runControl" jsonb);
        `)
        service = new CopilotCheckpointRetentionService({ manager: runner.manager } as Repository<CopilotCheckpoint>)
    })

    beforeEach(async () => {
        setDefaultTenantId(defaultTenantId)
        await runner.query(`TRUNCATE pg_temp.tenant_setting, pg_temp.copilot_checkpoint,
            pg_temp.copilot_checkpoint_writes, pg_temp.chat_message, pg_temp.chat_conversation_thread, pg_temp.xpert_agent_execution`)
    })

    afterAll(async () => {
        setDefaultTenantId(null)
        await runner?.release()
        if (database.isInitialized) await database.destroy()
    })

    async function settings(tenantId: string, enabled: string, days = '20') {
        await runner.query('INSERT INTO tenant_setting VALUES ($1, $2, $3), ($1, $4, $5)', [
            tenantId,
            COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
            enabled,
            COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
            days
        ])
    }

    async function checkpoint(
        tenantId: string | null,
        ageDays = 30,
        threadId = randomUUID(),
        parentId: string | null = null
    ) {
        const id = randomUUID()
        await runner.query(
            `INSERT INTO copilot_checkpoint VALUES
            ($1::uuid, $2, $3, now() - make_interval(days => $4), $5, '', $1::text, $6)`,
            [id, tenantId, organizationId, ageDays, threadId, parentId]
        )
        await runner.query(`INSERT INTO copilot_checkpoint_writes VALUES ($1, $2, $3, '', $4)`, [
            tenantId,
            organizationId,
            threadId,
            id
        ])
        return { id, threadId }
    }

    it('cleans expired data across tenants using only the default policy and preserves recent data', async () => {
        await settings(defaultTenantId, 'true')
        await settings(otherTenantId, 'false', '3650')
        await checkpoint(defaultTenantId)
        await checkpoint(otherTenantId)
        await checkpoint(randomUUID())
        await checkpoint(null)
        const recent = await checkpoint(otherTenantId, 10)

        expect(await service.execute({ batchSize: 2 })).toMatchObject({
            deletedCheckpointCount: 4,
            deletedWriteCount: 4,
            batches: 2
        })
        expect(await runner.query('SELECT id FROM copilot_checkpoint')).toEqual([{ id: recent.id }])
        expect(await runner.query('SELECT checkpoint_id FROM copilot_checkpoint_writes')).toEqual([
            { checkpoint_id: recent.id }
        ])
    })

    it.each([null, 'false'])('preserves all tenants when the default policy is %s', async (enabled) => {
        if (enabled !== null) await settings(defaultTenantId, enabled)
        await settings(otherTenantId, 'true', '1')
        const old = await checkpoint(otherTenantId, 100)
        expect(await service.execute()).toMatchObject({ deletedCheckpointCount: 0, deletedWriteCount: 0 })
        expect(await runner.query('SELECT id FROM copilot_checkpoint')).toEqual([{ id: old.id }])
    })

    it('retains branch ancestors, input references and run-controlled threads in other tenants', async () => {
        await settings(defaultTenantId, 'true')
        const ancestor = await checkpoint(otherTenantId)
        const branch = await checkpoint(otherTenantId, 30, ancestor.threadId, ancestor.id)
        const input = await checkpoint(otherTenantId)
        const running = await checkpoint(otherTenantId)
        await checkpoint(otherTenantId)
        const outputRef = { checkpoints: [{ threadId: branch.threadId, checkpointNs: '', checkpointId: branch.id }] }
        const inputRef = { checkpoint: { threadId: input.threadId, checkpointNs: '', checkpointId: input.id } }
        await runner.query(`INSERT INTO chat_message VALUES ($1, $2, NULL, $3, $4, $5)`, [
            otherTenantId,
            organizationId,
            input.threadId,
            inputRef,
            outputRef
        ])
        await runner.query(`INSERT INTO chat_conversation_thread VALUES ($1, '{}')`, [running.threadId])

        expect(await service.execute()).toMatchObject({ deletedCheckpointCount: 1, deletedWriteCount: 1 })
        const remaining: Array<{ id: string }> = await runner.query('SELECT id FROM copilot_checkpoint')
        expect(remaining.map(({ id }) => id).sort()).toEqual([ancestor.id, branch.id, input.id, running.id].sort())
    })
    it('pins a failed execution input after owner cleanup, without pinning other scopes or successful runs', async () => {
        await settings(defaultTenantId, 'true')
        const failed = await checkpoint(otherTenantId),
            succeeded = await checkpoint(otherTenantId),
            foreign = await checkpoint(otherTenantId)
        for (const [row, status, tenantId] of [
            [failed, 'error', otherTenantId],
            [succeeded, 'success', otherTenantId],
            [foreign, 'error', defaultTenantId]
        ] as const) {
            await runner.query('INSERT INTO xpert_agent_execution VALUES ($1, $2, $3, $4, $5)', [
                tenantId,
                organizationId,
                row.threadId,
                status,
                { recovery: { version: 1, input: { threadId: row.threadId, checkpointNs: '', checkpointId: row.id } } }
            ])
        }
        expect(await service.execute()).toMatchObject({ deletedCheckpointCount: 2, deletedWriteCount: 2 })
        expect(await runner.query('SELECT id FROM copilot_checkpoint')).toEqual([{ id: failed.id }])
    })
})
