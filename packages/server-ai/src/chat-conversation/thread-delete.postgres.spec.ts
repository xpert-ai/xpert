import { DataSource } from 'typeorm'
import { INestApplication } from '@nestjs/common'
import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { ConversationsController } from '../ai/conversation.controller'
import { ThreadsController } from '../ai/thread.controller'
import { ThreadDeleteHandler } from '../ai/commands/handlers/thread-delete.handler'
import { ThreadDeleteCommand } from '../ai/commands/thread-delete.command'
import { ChatConversationService } from './conversation.service'
import { ChatConversationThreadService } from './conversation-thread.service'
import { ChatConversationGoalService } from './goal'
import { ChatTaskSummaryService } from './task-summary.service'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { ChatMessageFeedbackService } from '../chat-message-feedback/feedback.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertService } from '../xpert/xpert.service'
import { AiService } from '../ai/ai.service'
import { RedisSseStreamService } from '../shared/stream/redis-sse.service'
import { AssertChatConversationAccessHandler } from './queries/handlers/conversation-assert-access.handler'
import { deletionFixture } from './testing/thread-delete.postgres.test-fixture'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { McpAppHistory } from '../mcp-app-runtime/mcp-app-history.entity'

jest.setTimeout(30_000)
type ThreadRuntimeRow = XpertAgentExecution | CopilotCheckpoint | CopilotCheckpointWrites
const url = process.env.XPERT_CONVERSATION_TEST_DATABASE_URL
const postgres = url ? describe : describe.skip
postgres('conversation deletion on PostgreSQL (issue #1434)', () => {
    let f: Awaited<ReturnType<typeof deletionFixture>>
    let app: INestApplication
    let endpoint: string
    let commands: CommandBus
    const tables = [
        'chat_conversation',
        'chat_conversation_thread',
        'chat_message',
        'chat_message_closure',
        'xpert_agent_execution',
        'copilot_checkpoint',
        'copilot_checkpoint_writes',
        'mcp_app_history'
    ]

    beforeAll(async () => {
        const queries = Object.create(QueryBus.prototype) as QueryBus
        commands = Object.create(CommandBus.prototype) as CommandBus
        f = await deletionFixture(url, queries, commands)
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            controllers: [ConversationsController, ThreadsController],
            providers: [
                ThreadDeleteHandler,
                { provide: DataSource, useValue: f.db },
                AssertChatConversationAccessHandler,
                { provide: ChatConversationThreadService, useValue: f.threads },
                { provide: ChatConversationService, useValue: f.conversations },
                ...[
                    ChatConversationGoalService,
                    ChatTaskSummaryService,
                    ChatMessageService,
                    ChatMessageFeedbackService,
                    PublishedXpertAccessService,
                    XpertService,
                    AiService,
                    RedisSseStreamService
                ].map((provide) => ({ provide, useValue: {} }))
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .compile()
        queries.execute = module.get(QueryBus).execute.bind(module.get(QueryBus))
        commands.execute = module.get(CommandBus).execute.bind(module.get(CommandBus))
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api/ai')
        await app.listen(0, '127.0.0.1')
        endpoint = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/ai`
    })
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(f.scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(f.scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(f.actorId)
        await f.db.query(`TRUNCATE ${tables.join(', ')} CASCADE`)
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        await app?.close()
        await f?.close()
    })

    async function snapshot() {
        return Promise.all(
            tables.map(async (table) => {
                const rows: object[] = await f.db.query(`SELECT * FROM "${table}"`)
                return rows.map((row) => JSON.stringify(row)).sort()
            })
        )
    }
    async function history() {
        const response = await fetch(`${endpoint}/conversations/search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({})
        })
        expect(response.status).toBe(200)
        return response.json() as Promise<{ items: { id: string }[] }>
    }
    async function failDuringCleanup(work: () => Promise<void>) {
        await f.db.query(`CREATE FUNCTION fail_thread_delete() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'injected checkpoint write deletion failure'; END $$;
            CREATE TRIGGER fail_thread_delete BEFORE DELETE ON copilot_checkpoint_writes
            FOR EACH ROW EXECUTE FUNCTION fail_thread_delete()`)
        try {
            await work()
        } finally {
            await f.db.query(
                'DROP TRIGGER fail_thread_delete ON copilot_checkpoint_writes; DROP FUNCTION fail_thread_delete()'
            )
        }
    }

    it('reproduces the original execution-first foreign-key failure', async () => {
        const seed = await f.seed()
        const before = await snapshot()
        await expect(f.db.manager.delete(XpertAgentExecution, { threadId: seed.main.threadId })).rejects.toMatchObject({
            driverError: { code: '23503', table: 'chat_message' }
        })
        expect(await snapshot()).toEqual(before)
    })

    it.each([
        [false, false],
        [true, false],
        [false, true],
        [true, true]
    ])(
        'returns HTTP 202 and disappears from fresh history (project=%s, legacy messages=%s)',
        async (project, legacy) => {
            const seed = await f.seed(project, legacy)
            expect((await history()).items.map((item) => item.id)).toContain(seed.conversation.id)
            expect(
                (await fetch(`${endpoint}/conversations/${seed.conversation.id}`, { method: 'DELETE' })).status
            ).toBe(202)
            for (const table of tables) expect(await f.db.query(`SELECT * FROM "${table}"`)).toEqual([])
            expect((await history()).items.map((item) => item.id)).not.toContain(seed.conversation.id)
            expect((await history()).items.map((item) => item.id)).not.toContain(seed.conversation.id)
            expect((await fetch(`${endpoint}/conversations/${seed.conversation.id}`)).status).toBe(403)
        }
    )

    it('deletes legacy conversations with no primary thread row', async () => {
        const seed = await f.seed(false, true)
        await f.db.manager.delete(ChatConversationThread, { id: seed.main.id })
        await commands.execute(new ThreadDeleteCommand(seed.main.threadId))
        for (const table of tables) expect(await f.db.query(`SELECT * FROM "${table}"`)).toEqual([])
    })

    it.each(['conversation', 'leaf', 'legacy'] as const)(
        'rolls back every mutation on %s cleanup failure',
        async (kind) => {
            const seed = await f.seed(true, kind === 'legacy')
            if (kind === 'legacy') await f.db.manager.delete(ChatConversationThread, { id: seed.main.id })
            const before = await snapshot()
            await failDuringCleanup(async () => {
                await expect(
                    commands.execute(new ThreadDeleteCommand(kind === 'leaf' ? seed.leaf.threadId : seed.main.threadId))
                ).rejects.toThrow('injected checkpoint write deletion failure')
            })
            expect(await snapshot()).toEqual(before)
            expect((await history()).items.map((item) => item.id)).toContain(seed.conversation.id)
        }
    )

    it.each([false, true])(
        'preserves main and sibling shared history after leaf deletion (legacy=%s)',
        async (legacy) => {
            const seed = await f.seed(false, legacy)
            const mainBefore = await f.threads.findVisibleMessages(seed.main.threadId)
            const siblingBefore = await f.threads.findVisibleMessages(seed.sibling.threadId)
            const runtimeBefore = await Promise.all(
                [XpertAgentExecution, CopilotCheckpoint, CopilotCheckpointWrites].map((entity) =>
                    f.db.getRepository<ThreadRuntimeRow>(entity).find()
                )
            )
            // Existing tombstones also need their execution FK detached before cleanup.
            await f.db.manager.softDelete(ChatMessage, seed.leafMessages[3].id)
            expect((await fetch(`${endpoint}/threads/${seed.leaf.threadId}`, { method: 'DELETE' })).status).toBe(202)
            expect(await f.threads.findVisibleMessages(seed.main.threadId)).toEqual(mainBefore)
            expect(await f.threads.findVisibleMessages(seed.sibling.threadId)).toEqual(siblingBefore)
            expect(mainBefore.items.map((message) => message.id)).toEqual(
                seed.mainMessages.map((message) => message.id)
            )
            expect(siblingBefore.items.map((message) => message.id)).toEqual(
                seed.siblingMessages.map((message) => message.id)
            )
            const tombstones = await f.db.manager.find(ChatMessage, {
                withDeleted: true,
                where: { createdInThreadId: seed.leaf.threadId }
            })
            expect(tombstones).toHaveLength(4)
            for (const message of tombstones) {
                expect(message.deletedAt).toBeInstanceOf(Date)
                expect(message.executionId).toBeNull()
            }
            expect(await f.db.manager.findOneBy(McpAppHistory, { id: seed.leafApp.id })).toBeNull()
            expect(await f.db.manager.findOneBy(McpAppHistory, { id: seed.mainApp.id })).not.toBeNull()
            expect(await f.db.manager.findOneBy(ChatConversation, { id: seed.conversation.id })).not.toBeNull()
            expect(await f.db.manager.findOneBy(ChatConversationThread, { id: seed.leaf.id })).toBeNull()
            for (const [index, entity] of [XpertAgentExecution, CopilotCheckpoint, CopilotCheckpointWrites].entries()) {
                const rows = await f.db.getRepository<ThreadRuntimeRow>(entity).find()
                expect(rows).toHaveLength(2)
                const retained = runtimeBefore[index].filter((row) =>
                    row instanceof XpertAgentExecution
                        ? row.threadId !== seed.leaf.threadId
                        : row.thread_id !== seed.leaf.threadId
                )
                expect(rows).toEqual(expect.arrayContaining(retained))
            }
        }
    )

    it('returns HTTP 409 without changes for a non-primary thread with children', async () => {
        const seed = await f.seed()
        await f.db.manager.save(ChatConversationThread, {
            ...f.scope,
            conversationId: seed.conversation.id,
            threadId: randomUUID(),
            parentThreadId: seed.leaf.threadId
        })
        const before = await snapshot()
        expect((await fetch(`${endpoint}/threads/${seed.leaf.threadId}`, { method: 'DELETE' })).status).toBe(409)
        expect(await snapshot()).toEqual(before)
    })

    it('retains owner authorization at the API boundary', async () => {
        const seed = await f.seed()
        const before = await snapshot()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(randomUUID())
        expect((await fetch(`${endpoint}/conversations/${seed.conversation.id}`, { method: 'DELETE' })).status).toBe(
            403
        )
        expect(await snapshot()).toEqual(before)
    })

    it('leaves other conversations and foreign organization runtime data intact', async () => {
        const target = await f.seed()
        const other = await f.seed(true)
        const otherHistory = await f.threads.findVisibleMessages(other.main.threadId)
        const organizationId = randomUUID()
        await f.db.manager.insert('Organization', { id: organizationId })
        const foreignScope = { ...f.scope, organizationId }
        const foreignExecution = await f.db.manager.save(XpertAgentExecution, {
            ...foreignScope,
            threadId: target.main.threadId
        })
        const foreignCheckpoint = await f.db.manager.save(CopilotCheckpoint, {
            ...foreignScope,
            thread_id: target.main.threadId,
            checkpoint_ns: 'nested:agent',
            checkpoint_id: randomUUID(),
            checkpoint: Buffer.from('{}'),
            metadata: Buffer.from('{}')
        })
        const foreignWrite = await f.db.manager.save(CopilotCheckpointWrites, {
            ...foreignScope,
            thread_id: target.main.threadId,
            checkpoint_ns: 'nested:agent',
            checkpoint_id: foreignCheckpoint.checkpoint_id,
            value: Buffer.from('{}')
        })
        await commands.execute(new ThreadDeleteCommand(target.main.threadId))
        expect(await f.threads.findVisibleMessages(other.main.threadId)).toEqual(otherHistory)
        expect(await f.db.manager.findOneByOrFail(XpertAgentExecution, { id: foreignExecution.id })).toMatchObject(
            foreignExecution
        )
        expect(await f.db.manager.findOneByOrFail(CopilotCheckpoint, { id: foreignCheckpoint.id })).toMatchObject(
            foreignCheckpoint
        )
        expect(await f.db.manager.findOneByOrFail(CopilotCheckpointWrites, { id: foreignWrite.id })).toMatchObject(
            foreignWrite
        )
    })

    it('waits for the conversation lock before mutating any rows', async () => {
        const seed = await f.seed()
        const before = await snapshot()
        const runner = f.db.createQueryRunner()
        await runner.startTransaction()
        await runner.manager.findOneOrFail(ChatConversation, {
            where: { id: seed.conversation.id },
            lock: { mode: 'pessimistic_write' }
        })
        const [{ pid }]: { pid: number }[] = await runner.query('SELECT pg_backend_pid() AS pid')
        const deletion = commands.execute(new ThreadDeleteCommand(seed.main.threadId))
        // Attach rejection handling immediately while the command waits for the row lock.
        const result = deletion.then(
            () => null,
            (error: Error) => error
        )
        try {
            let blocked = false
            for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
                const rows: { blocked: boolean }[] = await f.db.query(
                    'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',
                    [pid]
                )
                blocked = rows[0].blocked
                if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10))
            }
            expect(blocked).toBe(true)
            expect(await snapshot()).toEqual(before)
        } finally {
            await runner.rollbackTransaction()
            await runner.release()
        }
        expect(await result).toBeNull()
        expect(await f.db.manager.count(ChatConversation)).toBe(0)
    })
})
