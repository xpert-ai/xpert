import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { AgentInvocationWaitEntity } from '../agent-invocation/invocation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ThreadRunControlService } from './thread-run-control.service'
import { readRunLease, RUN_LEASE_KEY } from './thread-run-lease'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const nullableText = { ...text, nullable: true }
const scopeColumns = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid }

integration('durable pause control / PostgreSQL', () => {
    const schema = `pause_${randomUUID().replace(/-/g, '')}`
    let database: DataSource
    let first: ThreadRunControlService
    let second: ThreadRunControlService
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    let threadId: string
    let executionId: string

    beforeAll(async () => {
        if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        database = new DataSource({
            type: 'postgres',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: [
                new EntitySchema<ChatConversationThread>({
                    name: 'ChatConversationThread',
                    target: ChatConversationThread,
                    tableName: 'chat_conversation_thread',
                    columns: {
                        ...scopeColumns,
                        threadId: text,
                        conversationId: uuid,
                        status: text,
                        error: nullableText,
                        metadata: { type: 'jsonb', nullable: true },
                        runControl: { type: 'jsonb', nullable: true },
                        encryptedRunContext: { ...nullableText, select: false },
                        operation: { type: 'jsonb', nullable: true }
                    }
                }),
                new EntitySchema<ChatConversation>({
                    name: 'ChatConversation',
                    target: ChatConversation,
                    tableName: 'chat_conversation',
                    columns: {
                        ...scopeColumns,
                        threadId: text,
                        status: text,
                        error: nullableText,
                        operation: { type: 'jsonb', nullable: true }
                    }
                }),
                new EntitySchema<XpertAgentExecution>({
                    name: 'XpertAgentExecution',
                    target: XpertAgentExecution,
                    tableName: 'xpert_agent_execution',
                    columns: { ...scopeColumns, status: text, error: nullableText }
                }),
                new EntitySchema<ChatMessage>({
                    name: 'ChatMessage',
                    target: ChatMessage,
                    tableName: 'chat_message',
                    columns: { ...scopeColumns, executionId: uuid, status: text, error: nullableText }
                }),
                new EntitySchema<AgentInvocationWaitEntity>({
                    name: 'AgentInvocationWaitEntity',
                    target: AgentInvocationWaitEntity,
                    tableName: 'agent_invocation_wait',
                    columns: {
                        ...scopeColumns,
                        threadId: text,
                        state: text,
                        leaseToken: { ...uuid, nullable: true },
                        leaseUntil: { type: 'timestamptz', nullable: true },
                        lastError: nullableText
                    }
                })
            ]
        })
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
        first = new ThreadRunControlService(database.getRepository(ChatConversationThread), database)
        second = new ThreadRunControlService(database.getRepository(ChatConversationThread), database)
    })
    afterAll(async () => {
        first?.onModuleDestroy()
        second?.onModuleDestroy()
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await database.destroy()
        }
    })
    beforeEach(async () => {
        threadId = randomUUID()
        executionId = randomUUID()
        const conversationId = randomUUID()
        await database
            .getRepository(ChatConversationThread)
            .save({ ...scope, id: randomUUID(), threadId, conversationId, status: 'busy' })
        await database.getRepository(ChatConversation).save({ ...scope, id: conversationId, threadId, status: 'busy' })
        await database
            .getRepository(XpertAgentExecution)
            .save({ ...scope, id: executionId, status: XpertAgentExecutionStatusEnum.RUNNING })
        await database.getRepository(ChatMessage).save({ ...scope, id: randomUUID(), executionId, status: 'answering' })
        await database
            .getRepository(AgentInvocationWaitEntity)
            .save({ ...scope, id: randomUUID(), threadId, state: 'ready' })
        await first.start(threadId, executionId)
    })

    it('serializes competing pause clicks and keeps the same durable token', async () => {
        const [a, b] = await Promise.all([
            first.requestPause(threadId, executionId),
            second.requestPause(threadId, executionId)
        ])
        expect(a.pauseId).toBe(b.pauseId)
        expect(a.state).toBe('pausing')
        expect(JSON.stringify(a).length).toBeLessThan(512)
        const renewed = await database.getRepository(ChatConversationThread).findOneByOrFail({ threadId })
        expect(renewed.status).toBe('pausing')
        expect(await second.shouldPause(threadId, executionId)).toBe(true)
        await expect(second.requestPause(threadId, randomUUID())).rejects.toThrow('no longer active')
    })

    it('renews a live process and reconciles a dead owner once, invalidating delayed continuations', async () => {
        const threads = database.getRepository(ChatConversationThread)
        const before = await threads.findOneByOrFail({ threadId })
        await first.maintainLeases()
        const renewed = await threads.findOneByOrFail({ threadId })
        expect(Date.parse(readRunLease(renewed.metadata)!.expiresAt)).toBeGreaterThanOrEqual(
            Date.parse(readRunLease(before.metadata)!.expiresAt)
        )
        await first.requestPause(threadId, executionId)
        await threads.update(
            { threadId },
            {
                metadata: {
                    [RUN_LEASE_KEY]: {
                        owner: 'lost-process',
                        executionId,
                        expiresAt: new Date(0).toISOString()
                    }
                }
            }
        )
        await second.maintainLeases()
        const recovered = await threads.findOneByOrFail({ threadId })
        expect(recovered.status).toBe('error')
        expect(recovered.runControl).toBeNull()
        expect(readRunLease(recovered.metadata)).toBeNull()
        expect(await first.finish(threadId, executionId, 'idle')).toBe('error')
        expect(await second.recoverExpiredRun(threadId)).toBe(false)
        const wait = await database.getRepository(AgentInvocationWaitEntity).findOneByOrFail({ threadId })
        expect(wait.state).toBe('stale')
        expect((await database.getRepository(ChatMessage).findOneByOrFail({ executionId })).status).toBe('aborted')
    })

    it('does not interpret confirmed pauses or legacy unleased runs as dead owners', async () => {
        await first.requestPause(threadId, executionId)
        await first.stageCheckpoint(threadId, executionId, { threadId, checkpointNs: '', checkpointId: 'saved' })
        expect(await first.finish(threadId, executionId, 'interrupted')).toBe('paused')
        await second.maintainLeases()
        expect((await database.getRepository(ChatConversationThread).findOneByOrFail({ threadId })).status).toBe(
            'paused'
        )
        expect(await second.recoverExpiredRun(threadId)).toBe(false)
    })
})
