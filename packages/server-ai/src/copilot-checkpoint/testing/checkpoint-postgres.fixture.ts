import { randomUUID } from 'node:crypto'
import { createNamespace, getNamespace } from 'cls-hooked'
import { DataSource, EntitySchema, type Logger } from 'typeorm'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../writes/writes.entity'

// Only disposable local databases are accepted. Each fixture owns and removes its random schema.
export const checkpointTestDatabaseUrl = process.env.XPERT_CHECKPOINT_TEST_DATABASE_URL

class CheckpointTestTenant {
    id: string
}

export function withCheckpointScope<T>(tenantId: string, organizationId: string | null, work: () => Promise<T>) {
    const namespace = getNamespace('RequestContext') ?? createNamespace('RequestContext')
    return namespace.runPromise(async () => {
        namespace.set('RequestContext', {
            request: {
                user: { id: tenantId, tenantId, preferredLanguage: 'en-US' },
                headers: organizationId ? { 'organization-id': organizationId } : {}
            }
        })
        return work()
    })
}

export function createCheckpointPostgresFixture() {
    const schema = `checkpoint_reads_${randomUUID().replace(/-/g, '')}`
    const checkpointSelects: string[] = []
    const logger: Logger = {
        logQuery(query) {
            if (/^SELECT /i.test(query) && query.includes('."copilot_checkpoint"') && !/^SELECT COUNT/i.test(query)) {
                checkpointSelects.push(query)
            }
        },
        logQueryError() {},
        logQuerySlow() {},
        logSchemaBuild() {},
        logMigration() {},
        log() {}
    }
    const uuid = { type: 'uuid' as const }
    const text = { type: 'varchar' as const }
    const scope = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: { ...uuid, nullable: true } }
    const database = new DataSource({
        type: 'postgres',
        url: checkpointTestDatabaseUrl,
        schema,
        logger,
        logging: ['query'],
        extra: { connectionTimeoutMillis: 5000 },
        entities: [
            new EntitySchema<CheckpointTestTenant>({
                name: 'CheckpointTestTenant',
                target: CheckpointTestTenant,
                columns: { id: { ...uuid, primary: true } }
            }),
            new EntitySchema<CopilotCheckpoint>({
                name: 'CopilotCheckpoint',
                target: CopilotCheckpoint,
                tableName: 'copilot_checkpoint',
                columns: {
                    ...scope,
                    thread_id: text,
                    checkpoint_ns: text,
                    checkpoint_id: text,
                    parent_id: { ...text, nullable: true },
                    checkpoint: { type: 'bytea' },
                    metadata: { type: 'bytea' }
                },
                relations: {
                    tenant: { type: 'many-to-one', target: 'CheckpointTestTenant', joinColumn: { name: 'tenantId' } }
                }
            }),
            new EntitySchema<CopilotCheckpointWrites>({
                name: 'CopilotCheckpointWrites',
                target: CopilotCheckpointWrites,
                columns: { ...scope }
            }),
            new EntitySchema<ChatConversationThread>({
                name: 'ChatConversationThread',
                target: ChatConversationThread,
                tableName: 'chat_conversation_thread',
                columns: {
                    ...scope,
                    threadId: text,
                    status: text,
                    error: { ...text, nullable: true },
                    metadata: { type: 'jsonb', nullable: true },
                    runControl: { type: 'jsonb', nullable: true },
                    operation: { type: 'jsonb', nullable: true }
                }
            }),
            new EntitySchema<XpertAgentExecution>({
                name: 'XpertAgentExecution',
                target: XpertAgentExecution,
                tableName: 'xpert_agent_execution',
                columns: {
                    ...scope,
                    threadId: text,
                    status: text,
                    checkpointId: { ...text, nullable: true },
                    error: { ...text, nullable: true },
                    createdAt: { type: 'timestamptz', createDate: true },
                    updatedAt: { type: 'timestamptz', updateDate: true },
                    completedAt: { type: 'timestamptz', nullable: true }
                },
                relations: {
                    tenant: { type: 'many-to-one', target: 'CheckpointTestTenant', joinColumn: { name: 'tenantId' } }
                }
            })
        ]
    })
    async function close() {
        if (database.isInitialized) {
            try {
                await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            } finally {
                await database.destroy()
            }
        }
    }
    return {
        database,
        checkpointSelects,
        close,
        async initialize() {
            const url = new URL(checkpointTestDatabaseUrl ?? '')
            if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
                throw new Error('Use a disposable local _test database')
            }
            try {
                await database.initialize()
                await database.query(`CREATE SCHEMA "${schema}"`)
                await database.synchronize()
            } catch (error) {
                await close()
                throw error
            }
        },
        async tenant(id: string) {
            await database.getRepository(CheckpointTestTenant).save({ id })
        }
    }
}

export function expectCheckpointIdProjection(queries: string[]) {
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
        const projection = query.slice(0, query.indexOf(' FROM '))
        expect(projection).toContain('"checkpoint_id"')
        expect(projection).not.toMatch(/"(?:checkpoint|metadata)"/)
    }
}
