import { executionControlTestEntities, seedExecutionControlScope } from '../execution-control/testing/scope.fixture'
import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { ExecutionControlModule } from '../execution-control/execution-control.module'
import { XpertAgentExecutionService } from '../xpert-agent-execution/agent-execution.service'
import { DynamicTool } from '@langchain/core/tools'
import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { createClient, RedisClientType } from 'redis'
import { ExecutionCancelService } from '../execution-control/execution-cancel.service'
import { executionToolReceipts } from '../execution-control/adapters/execution-tool-receipts'
import { installThreadPauseGuards } from '../shared/agent/thread-pause'
import { ExecutionControlStore } from '../execution-control/execution-control.store'
import { ExecutionControl } from '../execution-control/execution-control.entity'
import { TXpertGraph, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { AgentInvocationWaitEntity } from '../agent-invocation/invocation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ThreadRunControlService } from './thread-run-control.service'
import { readRunLease, RUN_LEASE_KEY } from './thread-run-lease'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { legacyThreadGraphRevision, threadGraphRevision } from './thread-graph-revision'

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
    let conversationId: string

    beforeAll(async () => {
        if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        database = new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: [
                ...executionControlTestEntities,
                new EntitySchema<CopilotCheckpoint>({
                    name: 'CopilotCheckpoint',
                    target: CopilotCheckpoint,
                    tableName: 'copilot_checkpoint',
                    columns: { ...scopeColumns, thread_id: text, checkpoint_ns: text, checkpoint_id: text }
                }),
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
                        runtimeContinuationBlockedAt: { type: 'timestamptz', nullable: true },
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
                    columns: {
                        ...scopeColumns,
                        threadId: nullableText,
                        metadata: { type: 'jsonb', nullable: true },
                        checkpointId: nullableText,
                        checkpointNs: nullableText,
                        status: text,
                        error: nullableText,
                        completedAt: { type: 'timestamptz', nullable: true }
                    }
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
        await seedExecutionControlScope(database, scope)
        first = new ThreadRunControlService(
            database.getRepository(ChatConversationThread),
            database,
            new ExecutionControlStore(database)
        )
        second = new ThreadRunControlService(
            database.getRepository(ChatConversationThread),
            database,
            new ExecutionControlStore(database)
        )
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
        conversationId = randomUUID()
        await database
            .getRepository(ChatConversationThread)
            .save({ ...scope, id: randomUUID(), threadId, conversationId, status: 'busy' })
        await database.getRepository(ChatConversation).save({ ...scope, id: conversationId, threadId, status: 'busy' })
        await database
            .getRepository(XpertAgentExecution)
            .save({ ...scope, id: executionId, threadId, status: XpertAgentExecutionStatusEnum.RUNNING })
        await database.getRepository(ChatMessage).save({ ...scope, id: randomUUID(), executionId, status: 'answering' })
        await database
            .getRepository(AgentInvocationWaitEntity)
            .save({ ...scope, id: randomUUID(), threadId, state: 'ready' })
        await first.start(threadId, executionId)
    })

    it.each([false, true])('admits only one competing resume after publication (legacy=%s)', async (legacy) => {
        const graph: TXpertGraph = {
            nodes: [
                { key: 'agent', type: 'agent', position: { x: 0, y: 0 }, entity: { key: 'agent', prompt: 'same task' } }
            ],
            connections: []
        }
        const stored = legacy ? legacyThreadGraphRevision(graph) : threadGraphRevision(graph)
        await first.recordGraph(threadId, executionId, stored)
        const pause = await first.requestPause(threadId, executionId)
        const reference = { threadId, checkpointNs: '', checkpointId: 'saved' }
        await database
            .getRepository(CopilotCheckpoint)
            .save({ ...scope, id: randomUUID(), thread_id: threadId, checkpoint_ns: '', checkpoint_id: 'saved' })
        await first.stageCheckpoint(threadId, executionId, reference)
        await first.finish(threadId, executionId, 'interrupted')
        if (!legacy) graph.nodes[0].position.x = 400
        const current = threadGraphRevision(graph)
        const exact = legacyThreadGraphRevision(graph)
        const claims = await Promise.allSettled([
            first.claimResume(threadId, executionId, pause.pauseId, current, exact),
            second.claimResume(threadId, executionId, pause.pauseId, current, exact)
        ])
        expect(claims.filter((claim) => claim.status === 'fulfilled')).toEqual([
            { status: 'fulfilled', value: reference }
        ])
        expect(claims.filter((claim) => claim.status === 'rejected')).toHaveLength(1)
        expect(await first.recordGraph(threadId, executionId, current, exact)).toBe(stored)
        const admitted = await database.getRepository(ChatConversationThread).findOneByOrFail({ threadId })
        expect(admitted.runControl.graphRevision).toBe(stored)
        expect(admitted.status).toBe('busy')
        await expect(second.claimResume(threadId, executionId, pause.pauseId, current, exact)).rejects.toThrow()
    })

    it('rejects registration without a tenant before writing inherited nullable scope fields', async () => {
        const id = randomUUID()
        const store = new ExecutionControlStore(database)
        await expect(database.transaction((manager) => store.root(manager, { threadId }, id))).rejects.toThrow()
        expect(await database.getRepository(ExecutionControl).existsBy({ executionId: id })).toBe(false)
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
        const recovery = {
            version: 1 as const,
            graphRevision: 'graph',
            input: { threadId, checkpointNs: '', checkpointId: 'input' },
            latest: { threadId, checkpointNs: '', checkpointId: 'latest' }
        }
        await database.getRepository(XpertAgentExecution).update(executionId, {
            checkpointId: 'latest',
            checkpointNs: '',
            metadata: { recovery }
        })
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
        const stoppedExecution = await database.getRepository(XpertAgentExecution).findOneByOrFail({ id: executionId })
        expect(stoppedExecution).toMatchObject({ checkpointId: 'latest', metadata: { recovery } })
        expect(stoppedExecution.completedAt).toBeNull()
        expect(recovered.status).toBe('busy')
        expect(recovered.runControl.state).toBe('terminating')
        await expect(second.start(threadId, randomUUID())).rejects.toThrow()
        expect(await first.finish(threadId, executionId, 'idle')).toBe('interrupted')
        expect(await second.recoverExpiredRun(threadId)).toBe(false)
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
    it.each([true, false])(
        'updates cancellation status only for the selected working branch (selected: %s)',
        async (selected) => {
            if (!selected)
                await database.getRepository(ChatConversation).update(conversationId, { threadId: 'other-branch' })
            expect(await first.cancel(threadId, [executionId])).toBe(true)
            expect(await first.finish(threadId, executionId, 'idle')).toBe('interrupted')
            const conversation = await database.getRepository(ChatConversation).findOneByOrFail({ id: conversationId })
            expect(conversation.status).toBe(selected ? 'interrupted' : 'busy')
            expect(
                (await database.getRepository(ChatConversation).findOneByOrFail({ id: conversationId })).status
            ).toBe(selected ? 'interrupted' : 'busy')
        }
    )
    it('repairs a lost Redis notice and fences an old execution after a new run starts', async () => {
        const redisUrl = process.env.XPERT_CONTROL_TEST_REDIS_URL
        if (!redisUrl) throw new Error('Set XPERT_CONTROL_TEST_REDIS_URL to an isolated test Redis')
        const redis = createClient({ url: redisUrl }) as RedisClientType
        await redis.connect()
        const store = new ExecutionControlStore(database)
        const api = new ExecutionCancelService(redis, store)
        const worker = new ExecutionCancelService(redis, new ExecutionControlStore(database))
        const controller = new AbortController()
        worker.register(executionId, controller)
        await worker.onModuleInit()
        const publish = jest.spyOn(redis, 'publish').mockRejectedValueOnce(new Error('Injected lost notice'))
        try {
            await second.cancel(threadId, [executionId])
            await api.cancelExecutions([executionId])
            expect(controller.signal.aborted).toBe(false)
            await expect(second.start(threadId, randomUUID())).rejects.toThrow()
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Control delivery timed out')), 4000)
                controller.signal.addEventListener(
                    'abort',
                    () => {
                        clearTimeout(timeout)
                        resolve()
                    },
                    { once: true }
                )
            })
            expect(controller.signal.aborted).toBe(true)
            await first.finish(threadId, executionId, 'interrupted')
            await second.start(threadId, randomUUID())
            const tool = jest.fn(async () => 'must not run')
            const nodes = { tool: { runnable: RunnableLambda.from(tool) } }
            installThreadPauseGuards(nodes, () => first.shouldPause(threadId, executionId))
            await expect(nodes.tool.runnable.invoke('')).rejects.toThrow('Execution ownership ended')
            expect(tool).not.toHaveBeenCalled()
            // A new process registering after the original notice reads the same tombstone.
            const restarted = new ExecutionCancelService(redis, new ExecutionControlStore(database))
            const late = new AbortController()
            restarted.register(executionId, late)
            await restarted.check(executionId)
            expect(late.signal.aborted).toBe(true)
            await expect(first.start(threadId, executionId)).rejects.toThrow()
        } finally {
            publish.mockRestore()
            await worker.onModuleDestroy()
            await redis.quit()
        }
    })

    it('keeps independent/shared roots and siblings alive when controlling an attached subtree', async () => {
        const store = new ExecutionControlStore(database)
        const child = randomUUID(),
            grandchild = randomUUID(),
            sibling = randomUUID()
        const detached = randomUUID(),
            shared = randomUUID()
        await store.attach(child, executionId, 'attached')
        await store.attach(grandchild, child, 'attached')
        await store.attach(sibling, executionId, 'attached')
        await store.attach(detached, executionId, 'detached')
        await store.attach(shared, executionId, 'shared')
        await store.terminate([child])
        expect(await store.isTerminated(grandchild)).toBe(true)
        expect(await store.isTerminated(sibling)).toBe(false)
        expect(await store.isTerminated(executionId)).toBe(false)
        await store.terminate([executionId])
        await expect(store.attach(randomUUID(), child, 'attached')).rejects.toThrow()
        await expect(store.admit(sibling, 'late-tool')).rejects.toThrow()
        for (const id of [detached, shared]) {
            expect(await store.isTerminated(id)).toBe(false)
            await store.admit(id, 'independent-tool')
            await store.settle(id, 'independent-tool')
        }
    })

    it('does not mistake an aborted Runnable for a tool completion receipt', async () => {
        const store = new ExecutionControlStore(database)
        let release!: () => void
        let entered!: () => void
        const started = new Promise<void>((resolve) => {
            entered = resolve
        })
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        const calls = jest.fn(async () => {
            entered()
            await pending
            return 'finished'
        })
        const tool = new DynamicTool({ name: 'slow', description: 'controlled test', func: calls })
        const controller = new AbortController()
        let actual!: Promise<unknown>
        const wrapper = RunnableLambda.from(async (_input, config) => {
            actual = tool.invoke('input', config)
            return actual
        })
        const running = wrapper.invoke('', {
            signal: controller.signal,
            callbacks: [executionToolReceipts(store, executionId)]
        })
        const aborted = expect(running).rejects.toThrow()
        await started
        await second.cancel(threadId, [executionId])
        controller.abort(new Error('terminate'))
        await aborted
        expect(await first.finish(threadId, executionId, 'interrupted')).toBe('busy')
        await expect(second.start(threadId, randomUUID())).rejects.toThrow()
        await expect(second.requestPause(threadId, executionId)).rejects.toThrow()
        expect((await first.get(threadId)).state).toBe('terminating')
        release()
        await actual
        await second.maintainLeases()
        expect(await first.get(threadId)).toBeNull()
        expect(calls).toHaveBeenCalledTimes(1)
        await expect(second.start(threadId, executionId)).rejects.toThrow()
        await second.start(threadId, randomUUID())
    })

    it('pauses at the complete node boundary and resumes only once without repeating the tool', async () => {
        const store = new ExecutionControlStore(database)
        const tools = jest.fn(async () => {
            await second.requestPause(threadId, executionId)
            return 'saved result'
        })
        const tool = new DynamicTool({ name: 'once', description: 'controlled test', func: tools })
        const next = jest.fn(async () => ({ result: 'reported' }))
        const State = Annotation.Root({ result: Annotation<string> })
        const builder = new StateGraph(State)
            .addNode('tool', async (_state, config) => {
                await tool.invoke('first', config)
                return { result: await tool.invoke('second', config) }
            })
            .addNode('next', next)
            .addEdge(START, 'tool')
            .addEdge('tool', 'next')
            .addEdge('next', END)
        installThreadPauseGuards(builder.nodes, () => first.shouldPause(threadId, executionId))
        const graph = builder.compile({ checkpointer: new MemorySaver() })
        const config = { configurable: { thread_id: threadId }, callbacks: [executionToolReceipts(store, executionId)] }
        await first.recordGraph(threadId, executionId, 'revision')
        await graph.invoke({ result: '' }, config)
        const saved = await graph.getState(config)
        expect(saved.next).toEqual(['next'])
        const checkpoint = { threadId, checkpointNs: '', checkpointId: saved.config.configurable.checkpoint_id }
        await database.getRepository(CopilotCheckpoint).save({
            ...scope,
            id: randomUUID(),
            thread_id: threadId,
            checkpoint_ns: '',
            checkpoint_id: checkpoint.checkpointId
        })
        await first.stageCheckpoint(threadId, executionId, checkpoint)
        expect(await first.finish(threadId, executionId, 'interrupted')).toBe('paused')
        const pause = await first.get(threadId)
        const claims = await Promise.allSettled([
            first.claimResume(threadId, executionId, pause.pauseId, 'revision'),
            second.claimResume(threadId, executionId, pause.pauseId, 'revision')
        ])
        expect(claims.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        await graph.invoke(null, { ...config, configurable: saved.config.configurable })
        expect(tools).toHaveBeenCalledTimes(2)
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('makes termination monotonic against pause, rollback and repeated requests', async () => {
        await Promise.allSettled([first.requestPause(threadId, executionId), second.cancel(threadId, [executionId])])
        expect((await first.get(threadId)).state).toBe('terminating')
        const initial = await database.getRepository(ExecutionControl).findOneByOrFail({ executionId })
        await second.cancel(threadId, [executionId])
        await first.releaseResume(threadId, executionId, 'stale-pause')
        await first.stageCheckpoint(threadId, executionId, { threadId, checkpointNs: '', checkpointId: 'late' })
        const final = await database.getRepository(ExecutionControl).findOneByOrFail({ executionId })
        expect(final.desired).toBe('terminated')
        expect(final.revision).toBe(initial.revision)
        expect((await first.get(threadId)).state).toBe('terminating')
    })

    it('admits a concurrent tool identity only once and fails closed when its control is unavailable', async () => {
        const store = new ExecutionControlStore(database)
        const calls = jest.fn()
        const invoke = async () => {
            await store.admit(executionId, 'same-tool')
            calls()
        }
        const results = await Promise.allSettled([invoke(), invoke()])
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(calls).toHaveBeenCalledTimes(1)
        await expect(store.admit(randomUUID(), 'unknown')).rejects.toThrow()
        await expect(
            database.transaction((manager) =>
                store.root(
                    manager,
                    {
                        ...scope,
                        tenantId: randomUUID(),
                        threadId
                    },
                    executionId
                )
            )
        ).rejects.toThrow()
    })

    it('denies a late child tool before its body even when its parent is still running', async () => {
        const store = new ExecutionControlStore(database)
        const child = randomUUID()
        await store.attach(child, executionId, 'attached')
        await store.terminate([child])
        const body = jest.fn(async () => 'unexpected')
        const tool = new DynamicTool({ name: 'late', description: 'controlled test', func: body })
        const callbacks = [executionToolReceipts(store, executionId)]
        await expect(tool.invoke('', { callbacks, metadata: { executionId: child } })).rejects.toThrow()
        expect(body).not.toHaveBeenCalled()
        expect(await store.isTerminated(executionId)).toBe(false)
        await tool.invoke('', { callbacks, metadata: { executionId } })
        expect(body).toHaveBeenCalledTimes(1)
    })

    it('fails closed on database failure before executing a tool', async () => {
        const store = new ExecutionControlStore(database)
        const read = jest.spyOn(database, 'transaction').mockRejectedValueOnce(new Error('Database unavailable'))
        const body = jest.fn(async () => 'unexpected')
        const tool = new DynamicTool({ name: 'closed', description: 'controlled test', func: body })
        try {
            await expect(tool.invoke('', { callbacks: [executionToolReceipts(store, executionId)] })).rejects.toThrow(
                'Database unavailable'
            )
            expect(body).not.toHaveBeenCalled()
        } finally {
            read.mockRestore()
        }
    })

    it('does not revive an old pause through a delayed finalizer, rollback or execution ID', async () => {
        await first.recordGraph(threadId, executionId, 'revision')
        const pause = await first.requestPause(threadId, executionId)
        const checkpoint = { threadId, checkpointNs: '', checkpointId: 'saved' }
        await database.getRepository(CopilotCheckpoint).save({
            ...scope,
            id: randomUUID(),
            thread_id: threadId,
            checkpoint_ns: '',
            checkpoint_id: checkpoint.checkpointId
        })
        await first.stageCheckpoint(threadId, executionId, checkpoint)
        await first.finish(threadId, executionId, 'interrupted')
        expect(await first.finish(threadId, executionId, 'idle')).toBe('paused')
        await second.claimResume(threadId, executionId, pause.pauseId, 'revision')
        expect(await first.finish(threadId, executionId, 'error')).toBe('busy')
        const resumed = randomUUID()
        await second.bindResumedExecution(threadId, pause.pauseId, resumed)
        await first.cancel(threadId, [resumed])
        await first.releaseResume(threadId, executionId, pause.pauseId)
        expect((await first.get(threadId)).executionId).toBe(resumed)
        expect((await first.get(threadId)).state).toBe('terminating')
        await second.finish(threadId, resumed, 'idle')
        await expect(first.start(threadId, resumed)).rejects.toThrow()
        await expect(first.start(threadId, executionId)).rejects.toThrow()
        const fresh = randomUUID()
        await first.start(threadId, fresh)
        await first.finish(threadId, fresh, 'idle')
        expect(await first.finish(threadId, resumed, 'error')).toBe('idle')
    })

    it('allows rollback of an unstarted resume, then prepares a fresh execution exactly once', async () => {
        await first.recordGraph(threadId, executionId, 'revision')
        const pause = await first.requestPause(threadId, executionId)
        const checkpoint = { threadId, checkpointNs: '', checkpointId: 'saved' }
        await database.getRepository(CopilotCheckpoint).save({
            ...scope,
            id: randomUUID(),
            thread_id: threadId,
            checkpoint_ns: '',
            checkpoint_id: checkpoint.checkpointId
        })
        await first.stageCheckpoint(threadId, executionId, checkpoint)
        await first.finish(threadId, executionId, 'interrupted')
        await second.claimResume(threadId, executionId, pause.pauseId, 'revision', undefined, 'claim-1')
        const discarded = randomUUID()
        await second.bindResumedExecution(threadId, pause.pauseId, discarded, 'claim-1')
        await first.releaseResume(threadId, executionId, pause.pauseId, 'claim-1')
        await second.claimResume(threadId, executionId, pause.pauseId, 'revision', undefined, 'claim-2')
        const resumed = randomUUID()
        await second.bindResumedExecution(threadId, pause.pauseId, resumed, 'claim-2')
        await first.releaseResume(threadId, executionId, pause.pauseId, 'claim-1')
        expect((await first.get(threadId)).executionId).toBe(resumed)
        await expect(first.bindResumedExecution(threadId, pause.pauseId, randomUUID())).rejects.toThrow()
        expect(await new ExecutionControlStore(database).isTerminated(discarded)).toBe(true)
    })
    it('wires the shared control store through the real Nest module', async () => {
        @Global()
        @Module({ providers: [{ provide: DataSource, useValue: database }], exports: [DataSource] })
        class TestDatabaseModule {}
        const module = await Test.createTestingModule({ imports: [TestDatabaseModule, ExecutionControlModule] })
            .overrideProvider(REDIS_CLIENT)
            .useValue({ publish: jest.fn() })
            .compile()
        expect(module.get(ExecutionControlStore)).toBeInstanceOf(ExecutionControlStore)
        expect(module.get(ExecutionCancelService)).toBeInstanceOf(ExecutionCancelService)
        await module.close()
    })

    it('preserves a completed business result when cancellation arrives late', async () => {
        const executions = database.getRepository(XpertAgentExecution)
        const service = new XpertAgentExecutionService(executions)
        await executions.update(executionId, { status: XpertAgentExecutionStatusEnum.SUCCESS })
        await service.interruptRunning([executionId], threadId, 'Canceled by user')
        expect((await executions.findOneByOrFail({ id: executionId })).status).toBe(
            XpertAgentExecutionStatusEnum.SUCCESS
        )
        await executions.update(executionId, { status: XpertAgentExecutionStatusEnum.PENDING })
        await service.interruptRunning([executionId], threadId, 'Canceled by user')
        expect((await executions.findOneByOrFail({ id: executionId })).status).toBe(
            XpertAgentExecutionStatusEnum.INTERRUPTED
        )
    })
    it('finishes a group-style resume that binds the same execution identity', async () => {
        await first.recordGraph(threadId, executionId, 'revision')
        const pause = await first.requestPause(threadId, executionId)
        const checkpoint = { threadId, checkpointNs: '', checkpointId: 'saved' }
        await database.getRepository(CopilotCheckpoint).save({
            ...scope,
            id: randomUUID(),
            thread_id: threadId,
            checkpoint_ns: '',
            checkpoint_id: checkpoint.checkpointId
        })
        await first.stageCheckpoint(threadId, executionId, checkpoint)
        await first.finish(threadId, executionId, 'interrupted')
        await second.claimResume(threadId, executionId, pause.pauseId, 'revision', undefined, 'group-claim')
        await second.bindResumedExecution(threadId, pause.pauseId, executionId, 'group-claim')
        await second.ensureExecution(threadId, executionId)
        const store = new ExecutionControlStore(database)
        await store.admit(executionId, 'remaining-tool')
        await store.settle(executionId, 'remaining-tool')
        expect(await second.finish(threadId, executionId, 'idle')).toBe('idle')
    })
})
