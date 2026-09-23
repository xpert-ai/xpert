import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { Repository } from 'typeorm'
import { COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING } from '@xpert-ai/contracts'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointRetentionService } from '../copilot-checkpoint/retention.service'

// Explicit opt-in, isolated schema; never uses the platform's configured database.
const connectionString = process.env.CHATKIT_BRANCH_TEST_DATABASE_URL
const postgres = connectionString ? describe : describe.skip
postgres('conversation branch PostgreSQL migration and retention', () => {
    const client = new Client({ connectionString })
    const schema = `branch_test_${randomUUID().replace(/-/g, '')}`
    beforeAll(async () => {
        await client.connect()
        await client.query(`CREATE SCHEMA "${schema}"`)
        await client.query(`SET search_path TO "${schema}"`)
        await client.query(`
            CREATE TABLE chat_message (id uuid PRIMARY KEY, "tenantId" text, "organizationId" text,
                "deletedAt" timestamptz, "createdInThreadId" text, "inputCheckpoint" jsonb);
            CREATE TABLE chat_conversation (id uuid PRIMARY KEY, "createdById" text);
            CREATE TABLE chat_conversation_thread ("threadId" text, "runControl" jsonb);
            CREATE TABLE copilot_checkpoint (id uuid PRIMARY KEY, thread_id text, checkpoint_ns text,
                checkpoint_id text, parent_id text, "tenantId" text, "organizationId" text, "createdAt" timestamptz);
            CREATE TABLE tenant_setting ("tenantId" text, name text, value text);
        `)
    })
    afterAll(async () => {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        await client.end()
    })

    it('applies the nullable migration twice without fabricating old message anchors', async () => {
        const id = randomUUID()
        await client.query('INSERT INTO chat_message (id) VALUES ($1)', [id])
        const migration = await readFile(join(__dirname, 'migrations/20260922-conversation-branch.sql'), 'utf8')
        await client.query(migration)
        await client.query(migration)
        expect(
            (await client.query('SELECT "outputCheckpoint", "historicalAgentRuns" FROM chat_message WHERE id=$1', [id]))
                .rows
        ).toEqual([{ outputCheckpoint: null, historicalAgentRuns: null }])
    })

    it('retains sealed roots and all ancestors while collecting unrelated expired checkpoints', async () => {
        await client.query('INSERT INTO tenant_setting VALUES ($1, $2, $3)', [
            'tenant',
            COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
            'true'
        ])
        const ids = {
            ancestor: randomUUID(),
            sealed: randomUUID(),
            future: randomUUID(),
            otherOrg: randomUUID(),
            child: randomUUID()
        }
        for (const [name, id] of Object.entries(ids)) {
            await client.query(
                `INSERT INTO copilot_checkpoint VALUES ($1, 'thread', $2, $3, $4, 'tenant', $5, now()-interval '365 days')`,
                [
                    id,
                    name === 'child' ? 'subgraph' : '',
                    name,
                    name === 'sealed' ? 'ancestor' : null,
                    name === 'otherOrg' ? 'other-org' : 'org'
                ]
            )
        }
        await client.query(
            'INSERT INTO chat_message (id, "tenantId", "organizationId", "outputCheckpoint") VALUES ($1, $2, $3, $4)',
            [
                randomUUID(),
                'tenant',
                'org',
                {
                    checkpoints: [
                        { threadId: 'thread', checkpointNs: '', checkpointId: 'sealed' },
                        { threadId: 'thread', checkpointNs: 'subgraph', checkpointId: 'child' },
                        { threadId: 'thread', checkpointNs: '', checkpointId: 'otherOrg' }
                    ]
                }
            ]
        )
        const query = jest.fn().mockResolvedValue([])
        await new CopilotCheckpointRetentionService({
            manager: { query }
        } as unknown as Repository<CopilotCheckpoint>).execute()
        const candidates = await client.query(query.mock.calls[0][0], query.mock.calls[0][1])
        expect(candidates.rows.map((row: { id: string }) => row.id).sort()).toEqual([ids.future, ids.otherOrg].sort())
    })
})
